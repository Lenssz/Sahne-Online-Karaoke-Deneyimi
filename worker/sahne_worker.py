"""Windows tray worker for Sahne's private vocal separation and render queues."""

from __future__ import annotations

import ctypes
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from time import monotonic, sleep
from urllib.parse import urljoin, urlsplit
from uuid import UUID
import winreg

import keyring.backends.Windows
import pystray
import requests
from PIL import Image, ImageDraw


APP_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "SahneWorker"
CONFIG_PATH = APP_DIR / "config.json"
LOG_PATH = APP_DIR / "worker.log"
KEYRING_SERVICE = "Sahne Local Worker"
KEYRING_USER = "worker-token"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_NAME = "SahneWorker"
MAX_FILE_BYTES = 50 * 1024 * 1024
POLL_SECONDS = 30
HEARTBEAT_SECONDS = 60
LOGGER = logging.getLogger("sahne-worker")


class WorkerError(Exception):
    """An error safe to display without disclosing URLs or credentials."""


class LeaseLost(WorkerError):
    pass


def credential_store():
    # Refuse insecure keyring fallbacks: this backend is Windows Credential Manager.
    return keyring.backends.Windows.WinVaultKeyring()


def validate_site_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    local = parsed.hostname in {"localhost", "127.0.0.1"}
    if (
        (parsed.scheme != "https" and not (local and parsed.scheme == "http"))
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise WorkerError("Site adresi HTTPS olmalı. HTTP yalnızca localhost için kullanılabilir.")
    try:
        _ = parsed.port
    except ValueError as exc:
        raise WorkerError("Site adresindeki port geçersiz.") from exc
    return value.strip().rstrip("/")


def validate_https_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise WorkerError("Özel medya bağlantısı güvenli değil.")
    return value


def load_config() -> tuple[str, str]:
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        site_url = validate_site_url(data["site_url"])
        token = credential_store().get_password(KEYRING_SERVICE, KEYRING_USER)
    except (OSError, KeyError, ValueError, TypeError, RuntimeError) as exc:
        raise WorkerError("Ayarlar okunamadı. configure.cmd dosyasını çalıştır.") from exc
    if not token or len(token) < 32:
        raise WorkerError("Yardımcı anahtarı eksik. configure.cmd dosyasını çalıştır.")
    return site_url, token


def register_startup() -> None:
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    if not pythonw.is_file():
        raise WorkerError("pythonw.exe bulunamadı. Kurulumu yeniden çalıştır.")
    command = f'"{pythonw}" "{Path(__file__).resolve()}"'
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        winreg.SetValueEx(key, RUN_NAME, 0, winreg.REG_SZ, command)


def disable_startup() -> int:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, RUN_NAME)
    except FileNotFoundError:
        pass
    print("Sahne otomatik baslatma kapatildi.")
    return 0


def configure() -> int:
    import tkinter as tk
    from tkinter import messagebox

    APP_DIR.mkdir(parents=True, exist_ok=True)
    previous_url = ""
    if CONFIG_PATH.is_file():
        try:
            previous_url = json.loads(CONFIG_PATH.read_text(encoding="utf-8")).get("site_url", "")
        except (OSError, ValueError):
            pass

    root = tk.Tk()
    root.title("Sahne yardımcı programı ayarları")
    root.geometry("470x245")
    root.resizable(False, False)
    root.columnconfigure(0, weight=1)
    tk.Label(root, text="Sahne site adresi (HTTPS)").grid(row=0, column=0, sticky="w", padx=18, pady=(18, 4))
    site = tk.Entry(root, width=62)
    site.insert(0, previous_url)
    site.grid(row=1, column=0, padx=18, sticky="ew")
    tk.Label(root, text="LOCAL_WORKER_TOKEN (boş bırakırsan kayıtlı değer korunur)").grid(
        row=2, column=0, sticky="w", padx=18, pady=(16, 4)
    )
    secret = tk.Entry(root, width=62, show="•")
    secret.grid(row=3, column=0, padx=18, sticky="ew")
    saved = False

    def save() -> None:
        nonlocal saved
        try:
            site_url = validate_site_url(site.get())
            token = secret.get().strip()
            store = credential_store()
            if token:
                if len(token) < 32:
                    raise WorkerError("Yardımcı anahtarı en az 32 karakter olmalı.")
                store.set_password(KEYRING_SERVICE, KEYRING_USER, token)
            elif not store.get_password(KEYRING_SERVICE, KEYRING_USER):
                raise WorkerError("İlk kurulumda yardımcı anahtarını girmelisin.")
            CONFIG_PATH.write_text(json.dumps({"site_url": site_url}), encoding="utf-8")
            register_startup()
        except (WorkerError, OSError, RuntimeError) as exc:
            messagebox.showerror("Ayarlar kaydedilemedi", str(exc), parent=root)
            return
        saved = True
        messagebox.showinfo("Hazır", "Ayarlar kaydedildi. Sahne Windows oturumu açıldığında başlayacak.", parent=root)
        root.destroy()

    tk.Button(root, text="Kaydet ve otomatik başlatmayı ayarla", command=save).grid(
        row=4, column=0, padx=18, pady=20, sticky="ew"
    )
    root.mainloop()
    return 0 if saved else 1


def setup_logging() -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    LOGGER.setLevel(logging.INFO)
    handler = RotatingFileHandler(LOG_PATH, maxBytes=1_000_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOGGER.addHandler(handler)


def job_uuid(value: object) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise WorkerError("Sunucu geçersiz iş kimliği döndürdü.") from exc


class ApiClient:
    def __init__(self, site_url: str, token: str):
        self.site_url = site_url
        self.token = token

    def _post(self, path: str, *, lease: str | None = None, file: Path | None = None,
              file_kind: str = "vocal", error: str | None = None):
        headers = {"Authorization": f"Bearer {self.token}"}
        if lease:
            headers["X-Worker-Lease"] = lease
        options = {"json": {"error": error}} if error else {}
        try:
            if file:
                with file.open("rb") as stream:
                    response = requests.post(
                        self.site_url + path,
                        headers=headers,
                        files={"file": ("final.mp4", stream, "video/mp4") if file_kind == "render"
                               else ("no_vocals.mp3", stream, "audio/mpeg")},
                        timeout=(10, 300),
                        allow_redirects=False,
                    )
            else:
                response = requests.post(
                    self.site_url + path, headers=headers,
                    timeout=(10, 120) if path == "/api/local-worker/render-jobs/claim" else (10, 30),
                    allow_redirects=False, **options,
                )
        except (requests.RequestException, OSError) as exc:
            raise WorkerError("Siteyle bağlantı kurulamadı.") from exc
        if response.status_code == 401:
            raise WorkerError("Yardımcı anahtarı geçersiz. configure.cmd ile kontrol et.")
        if response.status_code == 409:
            raise LeaseLost("İş başka bir denemeye geçti.")
        if response.status_code == 413:
            raise WorkerError("50 MB dosya sınırı veya site depolama kotası aşıldı.")
        if response.status_code >= 300:
            detail = None
            if "application/json" in response.headers.get("Content-Type", "").lower():
                try:
                    message = response.json().get("error")
                    if isinstance(message, str) and 0 < len(message) <= 200:
                        detail = message
                except (ValueError, AttributeError):
                    pass
            suffix = f" {detail}" if detail else ""
            raise WorkerError(f"Site isteği tamamlanamadı (HTTP {response.status_code}).{suffix}")
        return response

    def claim(self) -> dict | None:
        response = self._post("/api/local-worker/jobs/claim")
        if response.status_code == 204:
            return None
        try:
            data = response.json()
            return {
                "kind": "vocal",
                "job_id": job_uuid(data["job_id"]),
                "lease_id": job_uuid(data["lease_id"]),
                "source_url": validate_https_url(data["source_url"]),
            }
        except (ValueError, KeyError, TypeError) as exc:
            raise WorkerError("Sunucu geçersiz iş bilgisi döndürdü.") from exc

    def claim_render(self) -> dict | None:
        response = self._post("/api/local-worker/render-jobs/claim")
        if response.status_code == 204:
            return None
        try:
            data = response.json()
            items = data["recordings"]
            duration = int(data["duration_seconds"])
            if not isinstance(items, list) or not 1 <= len(items) <= 500 or not 1 <= duration <= 7200:
                raise ValueError("Invalid render size")
            recordings = []
            for item in items:
                start = int(item["capture_start_ms"])
                length = int(item["duration_ms"])
                offset = int(item["offset_ms"])
                if start < 0 or not 200 <= length <= 7_205_000 or not -500 <= offset <= 500:
                    raise ValueError("Invalid recording time")
                recordings.append({
                    "url": validate_https_url(item["url"]),
                    "capture_start_ms": start, "duration_ms": length, "offset_ms": offset,
                })
            return {
                "kind": "render",
                "job_id": job_uuid(data["job_id"]),
                "lease_id": job_uuid(data["lease_id"]),
                "clip_url": validate_https_url(data["clip_url"]),
                "instrumental_url": validate_https_url(data["instrumental_url"]),
                "recordings": recordings,
                "duration_seconds": duration,
            }
        except (ValueError, KeyError, TypeError) as exc:
            raise WorkerError("Sunucu geçersiz render bilgisi döndürdü.") from exc

    def heartbeat(self, job_id: str, lease_id: str) -> None:
        self._post(f"/api/local-worker/jobs/{job_id}/heartbeat", lease=lease_id)

    def upload(self, job_id: str, lease_id: str, file: Path) -> None:
        self._post(f"/api/local-worker/jobs/{job_id}/result", lease=lease_id, file=file)

    def fail(self, job_id: str, lease_id: str, message: str) -> None:
        self._post(f"/api/local-worker/jobs/{job_id}/fail", lease=lease_id, error=message[:300])

    def render_heartbeat(self, job_id: str, lease_id: str) -> None:
        self._post(f"/api/local-worker/render-jobs/{job_id}/heartbeat", lease=lease_id)

    def render_upload(self, job_id: str, lease_id: str, file: Path) -> None:
        self._post(f"/api/local-worker/render-jobs/{job_id}/result", lease=lease_id,
                   file=file, file_kind="render")

    def render_fail(self, job_id: str, lease_id: str, message: str) -> None:
        self._post(f"/api/local-worker/render-jobs/{job_id}/fail", lease=lease_id, error=message[:300])


def download_clip(url: str, output: Path) -> None:
    # Signed URLs never receive the worker bearer token.
    current = validate_https_url(url)
    for _ in range(4):
        try:
            with requests.get(current, stream=True, timeout=(10, 60), allow_redirects=False) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    current = validate_https_url(urljoin(current, response.headers.get("Location", "")))
                    continue
                if response.status_code != 200:
                    raise WorkerError(f"Özel medya indirilemedi (HTTP {response.status_code}).")
                size = 0
                with output.open("wb") as stream:
                    for chunk in response.iter_content(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_FILE_BYTES:
                            raise WorkerError("Kaynak medya 50 MB sınırını aşıyor.")
                        stream.write(chunk)
                if not size:
                    raise WorkerError("Kaynak medya boş.")
                return
        except requests.RequestException as exc:
            raise WorkerError("Özel medya indirme bağlantısı kesildi.") from exc
    raise WorkerError("Özel medya bağlantısı çok kez yönlendirildi.")


def run_command(args: list[str], lost: threading.Event, timeout_seconds: int, label: str) -> None:
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
    except OSError as exc:
        raise WorkerError(f"{label} başlatılamadı. Kurulumu kontrol et.") from exc
    deadline = monotonic() + timeout_seconds
    while process.poll() is None:
        if lost.is_set() or monotonic() > deadline:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            if lost.is_set():
                raise LeaseLost("İş başka bir denemeye geçti.")
            raise WorkerError(f"{label} zaman aşımına uğradı.")
        sleep(1)
    if process.returncode:
        raise WorkerError(f"{label} tamamlanamadı (kod {process.returncode}).")


class Heartbeat:
    def __init__(self, api: ApiClient, job_id: str, lease_id: str, kind: str = "vocal"):
        self.api = api
        self.job_id = job_id
        self.lease_id = lease_id
        self.kind = kind
        self.done = threading.Event()
        self.lost = threading.Event()
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.done.set()
        self.thread.join(timeout=15)

    def _loop(self):
        while not self.done.wait(HEARTBEAT_SECONDS):
            try:
                if self.kind == "render":
                    self.api.render_heartbeat(self.job_id, self.lease_id)
                else:
                    self.api.heartbeat(self.job_id, self.lease_id)
            except LeaseLost:
                self.lost.set()
                return
            except WorkerError as exc:
                LOGGER.warning("Heartbeat gönderilemedi: %s; bağlantı tekrar denenecek.", exc)


def separate_clip(source: Path, directory: Path, lost: threading.Event) -> Path:
    scripts = Path(sys.executable).parent
    ffmpeg = scripts / "ffmpeg.exe"
    if not ffmpeg.is_file():
        raise WorkerError("FFmpeg bulunamadı. install.cmd dosyasını yeniden çalıştır.")
    os.environ["PATH"] = str(scripts) + os.pathsep + os.environ.get("PATH", "")
    audio = directory / "input.mp3"
    run_command(
        [str(ffmpeg), "-y", "-nostdin", "-loglevel", "error", "-i", str(source),
         "-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "256k", str(audio)],
        lost, 3600, "FFmpeg",
    )
    if not audio.is_file() or not audio.stat().st_size:
        raise WorkerError("Klipte işlenebilir ses bulunamadı.")
    output = directory / "separated"
    run_command(
        [sys.executable, "-m", "demucs", "-d", "cpu", "-n", "htdemucs",
         "--two-stems=vocals", "--mp3", "--mp3-bitrate", "256", "-o", str(output), str(audio)],
        lost, 21600, "Demucs",
    )
    results = list(output.rglob("no_vocals.mp3"))
    if len(results) != 1:
        raise WorkerError("Demucs altyapı dosyasını oluşturamadı.")
    instrumental = results[0]
    if instrumental.stat().st_size > MAX_FILE_BYTES:
        for bitrate in (192, 128, 96, 64):
            smaller = directory / f"instrumental-{bitrate}.mp3"
            run_command(
                [str(ffmpeg), "-y", "-nostdin", "-loglevel", "error", "-i", str(instrumental),
                 "-b:a", f"{bitrate}k", str(smaller)],
                lost, 3600, "Ses sıkıştırma",
            )
            if smaller.is_file() and smaller.stat().st_size <= MAX_FILE_BYTES:
                return smaller
        raise WorkerError("Altyapı 50 MB sınırına sığmadı. Daha kısa klip kullan.")
    return instrumental


def render_video(source: Path, music: Path, recordings: list[dict], directory: Path,
                 duration_seconds: int, lost: threading.Event, status) -> Path:
    ffmpeg = Path(sys.executable).parent / "ffmpeg.exe"
    if not ffmpeg.is_file():
        raise WorkerError("FFmpeg bulunamadı. install.cmd dosyasını yeniden çalıştır.")
    if not recordings:
        raise WorkerError("Render için mikrofon kaydı bulunamadı.")
    batches: list[Path] = []
    for batch_number, first in enumerate(range(0, len(recordings), 16)):
        batch = recordings[first:first + 16]
        filters = []
        labels = []
        args = [str(ffmpeg), "-y", "-nostdin", "-loglevel", "error"]
        for index, item in enumerate(batch):
            args.extend(["-i", str(item["file"])])
            start = item["capture_start_ms"] + item["offset_ms"]
            trim = max(0, -start)
            delay = max(0, start)
            length = max(0.2, (item["duration_ms"] - trim) / 1000)
            label = f"a{index}"
            labels.append(f"[{label}]")
            filters.append(
                f"[{index}:a]atrim=start={trim / 1000:.3f}:duration={length:.3f},"
                f"asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
                "highpass=f=80,dynaudnorm=f=250:g=7:m=3:p=0.8,"
                f"adelay={delay}|{delay}[{label}]"
            )
        if len(labels) == 1:
            filters.append(labels[0] + f"apad=whole_dur={duration_seconds},atrim=0:{duration_seconds},"
                           "alimiter=limit=0.95[mix]")
        else:
            filters.append(
                "".join(labels) + f"amix=inputs={len(labels)}:duration=longest:"
                f"dropout_transition=0,volume={len(labels)},apad=whole_dur={duration_seconds},"
                f"atrim=0:{duration_seconds},alimiter=limit=0.95[mix]"
            )
        script = directory / f"voice-batch-{batch_number}.txt"
        script.write_text(";".join(filters), encoding="utf-8")
        output = directory / f"voice-batch-{batch_number}.flac"
        args.extend(["-filter_complex_script", str(script), "-map", "[mix]",
                     "-ar", "48000", "-c:a", "flac", "-t", str(duration_seconds), str(output)])
        status(f"Sesler karıştırılıyor ({batch_number + 1}/{(len(recordings) + 15) // 16})")
        run_command(args, lost, 3600, "Ses karıştırma")
        if not output.is_file() or output.stat().st_size == 0:
            raise WorkerError("Mikrofon sesleri birleştirilemedi.")
        batches.append(output)

    audio_filters = [
        f"[1:a]aresample=48000,apad=whole_dur={duration_seconds},atrim=0:{duration_seconds},"
        "asetpts=PTS-STARTPTS,volume=0.50[base]"
    ]
    labels = ["[base]"]
    for index in range(len(batches)):
        label = f"voice{index}"
        labels.append(f"[{label}]")
        audio_filters.append(f"[{index + 2}:a]aresample=48000,asetpts=PTS-STARTPTS[{label}]")
    audio_filters.append(
        "".join(labels) + f"amix=inputs={len(labels)}:duration=first:"
        f"dropout_transition=0,volume={len(labels)},alimiter=limit=0.95[out]"
    )
    script = directory / "final-mix.txt"
    script.write_text(";".join(audio_filters), encoding="utf-8")
    # The source clip is input 0, but only its video stream is mapped.
    # Its original vocal-containing audio never reaches the output.
    base_bitrate = min(2_500_000, int((MAX_FILE_BYTES * 8 / duration_seconds - 128_000) * 0.75))
    if base_bitrate < 200_000:
        raise WorkerError("Bu klip 50 MB final video sınırı için çok uzun.")
    for attempt, ratio in enumerate((1.0, 0.7, 0.45), start=1):
        bitrate = max(180_000, int(base_bitrate * ratio))
        output = directory / f"final-{attempt}.mp4"
        args = [str(ffmpeg), "-y", "-nostdin", "-loglevel", "error",
                "-i", str(source), "-i", str(music)]
        for batch in batches:
            args.extend(["-i", str(batch)])
        args.extend([
            "-filter_complex_script", str(script),
            "-map", "0:v:0", "-map", "[out]",
            "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,"
                   "pad=1280:720:(ow-iw)/2:(oh-ih)/2",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-b:v", str(bitrate), "-maxrate", str(bitrate),
            "-bufsize", str(bitrate * 2),
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", "-t", str(duration_seconds),
            "-shortest", str(output),
        ])
        status(f"Video oluşturuluyor ({attempt}/3)")
        run_command(args, lost, 21600, "FFmpeg video render")
        if output.is_file() and 1024 < output.stat().st_size <= MAX_FILE_BYTES:
            return output
    raise WorkerError("Final video 50 MB sınırına sığmadı. Daha kısa klip kullan.")


def process_render_job(api: ApiClient, job: dict, status) -> None:
    job_id, lease_id = job["job_id"], job["lease_id"]
    try:
        with Heartbeat(api, job_id, lease_id, "render") as heartbeat:
            with tempfile.TemporaryDirectory(prefix="sahne-render-") as temp:
                directory = Path(temp)
                status("Render kaynakları indiriliyor")
                clip = directory / "source-video"
                music = directory / "instrumental"
                download_clip(job["clip_url"], clip)
                download_clip(job["instrumental_url"], music)
                recordings = []
                for index, item in enumerate(job["recordings"]):
                    if heartbeat.lost.is_set():
                        raise LeaseLost("İş başka bir denemeye geçti.")
                    file = directory / f"mic-{index}"
                    download_clip(item["url"], file)
                    recordings.append({**item, "file": file})
                    status(f"Mikrofon kayıtları indiriliyor ({index + 1}/{len(job['recordings'])})")
                output = render_video(
                    clip, music, recordings, directory, job["duration_seconds"],
                    heartbeat.lost, status,
                )
                if heartbeat.lost.is_set():
                    raise LeaseLost("İş başka bir denemeye geçti.")
                status("Final video yükleniyor")
                for attempt in range(3):
                    try:
                        api.render_upload(job_id, lease_id, output)
                        break
                    except LeaseLost:
                        raise
                    except WorkerError:
                        if attempt == 2 or heartbeat.lost.is_set():
                            raise
                        heartbeat.done.wait(5 * (attempt + 1))
                status("Final video hazır")
                LOGGER.info("Bir render işi tamamlandı.")
    except LeaseLost:
        status("Render işi yeniden sıraya alındı")
        LOGGER.warning("Render işleminin hakkı sona erdi.")
    except WorkerError as exc:
        status(f"Hata: {exc}")
        LOGGER.error("Render tamamlanamadı: %s", exc)
        try:
            api.render_fail(job_id, lease_id, str(exc))
        except WorkerError:
            LOGGER.warning("Render hatası siteye iletilemedi.")
    except Exception as exc:
        status("Hata: beklenmeyen render hatası")
        LOGGER.error("Beklenmeyen render hatası: %s", type(exc).__name__)
        try:
            api.render_fail(job_id, lease_id, "Bilgisayarda beklenmeyen render hatası.")
        except WorkerError:
            LOGGER.warning("Render hatası siteye iletilemedi.")


def process_job(api: ApiClient, job: dict, status) -> None:
    job_id = job["job_id"]
    lease_id = job["lease_id"]
    try:
        with Heartbeat(api, job_id, lease_id) as heartbeat:
            with tempfile.TemporaryDirectory(prefix="sahne-worker-") as temp:
                directory = Path(temp)
                status("Klip indiriliyor")
                source = directory / "clip"
                download_clip(job["source_url"], source)
                if heartbeat.lost.is_set():
                    raise LeaseLost("İş başka bir denemeye geçti.")
                status("Vokal ayrılıyor")
                instrumental = separate_clip(source, directory, heartbeat.lost)
                if heartbeat.lost.is_set():
                    raise LeaseLost("İş başka bir denemeye geçti.")
                status("Sonuç yükleniyor")
                for attempt in range(3):
                    try:
                        api.upload(job_id, lease_id, instrumental)
                        break
                    except LeaseLost:
                        raise
                    except WorkerError:
                        if attempt == 2 or heartbeat.lost.is_set():
                            raise
                        threading.Event().wait(5 * (attempt + 1))
                status("Hazır")
                LOGGER.info("Bir iş tamamlandı.")
    except LeaseLost:
        status("İş yeniden sıraya alındı")
        LOGGER.warning("İşin işlem hakkı sona erdi.")
    except WorkerError as exc:
        status(f"Hata: {exc}")
        LOGGER.error("İş tamamlanamadı: %s", exc)
        try:
            api.fail(job_id, lease_id, str(exc))
        except WorkerError:
            LOGGER.warning("Hata durumu siteye iletilemedi; iş zaman aşımıyla yeniden denenecek.")
    except Exception as exc:
        status("Hata: beklenmeyen işlem hatası")
        LOGGER.error("Beklenmeyen işleme hatası: %s", type(exc).__name__)
        try:
            api.fail(job_id, lease_id, "Bilgisayarda beklenmeyen işlem hatası.")
        except WorkerError:
            LOGGER.warning("Hata durumu siteye iletilemedi.")


class TrayWorker:
    def __init__(self, api: ApiClient):
        self.api = api
        self.stop = threading.Event()
        self.paused = threading.Event()
        self.status = "Başlıyor"
        self.status_lock = threading.Lock()
        self.icon = pystray.Icon("SahneWorker", self._icon_image(), "Sahne: Başlıyor", menu=pystray.Menu(
            pystray.MenuItem(lambda _: f"Durum: {self.current_status()}", None, enabled=False),
            pystray.MenuItem(lambda _: "Devam et" if self.paused.is_set() else "Duraklat", self.toggle_pause),
            pystray.MenuItem("Günlüğü aç", self.open_log),
            pystray.MenuItem("Çıkış", self.exit),
        ))

    @staticmethod
    def _icon_image():
        image = Image.new("RGB", (64, 64), "#1a1428")
        draw = ImageDraw.Draw(image)
        for x, height in ((13, 17), (25, 35), (37, 27), (49, 17)):
            draw.rounded_rectangle((x, 32 - height // 2, x + 6, 32 + height // 2), radius=3, fill="#aa84f2")
        return image

    def current_status(self) -> str:
        with self.status_lock:
            return self.status

    def set_status(self, value: str) -> None:
        with self.status_lock:
            self.status = value
        self.icon.title = f"Sahne: {value}"[:120]
        self.icon.update_menu()

    def toggle_pause(self, *_):
        if self.paused.is_set():
            self.paused.clear()
            self.set_status("Devam ediyor")
        else:
            self.paused.set()
            self.set_status("Duraklatıldı")

    @staticmethod
    def open_log(*_):
        LOG_PATH.touch(exist_ok=True)
        os.startfile(LOG_PATH)

    def exit(self, *_):
        self.stop.set()
        self.paused.clear()
        self.set_status("İş bitince kapanacak")

    def loop(self):
        try:
            while not self.stop.is_set():
                if self.paused.is_set():
                    self.stop.wait(1)
                    continue
                try:
                    job = self.api.claim()
                    if job:
                        process_job(self.api, job, self.set_status)
                    else:
                        render_job = self.api.claim_render()
                        if render_job:
                            process_render_job(self.api, render_job, self.set_status)
                        else:
                            self.set_status("İş bekliyor")
                except WorkerError as exc:
                    self.set_status(str(exc))
                    LOGGER.warning("İş sırası okunamadı: %s", exc)
                if self.paused.is_set():
                    self.set_status("Duraklatıldı")
                if not self.stop.is_set():
                    self.stop.wait(POLL_SECONDS)
        finally:
            self.icon.stop()

    def run(self):
        def start(icon):
            icon.visible = True
            self.loop()

        self.icon.run(setup=start)


def acquire_single_instance():
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p)
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    mutex = kernel32.CreateMutexW(None, False, r"Local\SahneWorkerTray")
    if not mutex:
        raise WorkerError("Yardımcı program başlatılamadı.")
    if ctypes.get_last_error() == 183:
        kernel32.CloseHandle(mutex)
        return None
    return mutex


def main() -> int:
    if sys.platform != "win32":
        print("Sahne yardımcı programı yalnızca Windows'ta çalışır.")
        return 1
    if len(sys.argv) > 1 and sys.argv[1] == "configure":
        return configure()
    if len(sys.argv) > 1 and sys.argv[1] == "disable-startup":
        return disable_startup()
    setup_logging()
    try:
        site_url, token = load_config()
        mutex = acquire_single_instance()
        if mutex is None:
            return 0
        TrayWorker(ApiClient(site_url, token)).run()
        ctypes.windll.kernel32.CloseHandle(mutex)
        return 0
    except WorkerError as exc:
        LOGGER.error("%s", exc)
        from tkinter import Tk, messagebox
        root = Tk()
        root.withdraw()
        messagebox.showerror("Sahne yardımcı programı", str(exc), parent=root)
        root.destroy()
        return 1


if __name__ == "__main__":
    sys.exit(main())
