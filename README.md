# Sahne — özel arkadaş stüdyosu

Next.js App Router, TypeScript ve Tailwind. Mevcut koyu stüdyo tasarımı korunarak Supabase Auth, PostgreSQL erişim kuralları ve özel dosya depolaması eklendi.

## Tamamlanan modül

- Yönetici şifreyle giriş yapar; arkadaşlar e-posta vermeden özel bağlantı ve adlarıyla katılır.
- Yalnızca yönetici şarkı, 1–24 şarkıcı rolü, zamanlı söz ve klip ekler.
- Yönetici bir şarkı için özel oda oluşturur ve otomatik olarak üye olur.
- Her rol için 7 günlük, tek kullanımlık davet bağlantısı. Yeni davet o rolün önceki bekleyen bağlantısını iptal eder; yönetici ayrıca iptal edebilir.
- Davet bağlantısındaki 256 bitlik gizli anahtar rolü belirler. Davet kabulü ve rol ataması tek veritabanı işlemidir. Her kullanıcı oda başına en fazla bir şarkıcı rolü alır.
- Oda, üyeler ve oda medyası yalnızca katılmış üyelere açılır. Yönetici de oluşturmadığı/katılmadığı odaları göremez. Şarkılar yöneticinin kitaplığında ve o şarkının odasına katılan üyelerde görünür.
- `studio-private` bucket herkese kapalıdır. Üyelik kontrolünden sonra 300 saniyelik medya URL'si verilir. Yönetici klip/altyapı yükleyebilir (dosya başına 50 MB, toplam özel depolamada 1 GB sınırı).
- Vokal ayırma düğmesi veritabanında iş oluşturur. Windows yardımcı programı açıksa işi alır, Demucs ile altyapıyı çıkarır ve siteye geri yükler. İşler bekliyor/işleniyor/hazır/hata durumlarıyla izlenir.
- İşlem sonucu veya elle yüklenen altyapı yönetici tarafından dinlenip onaylanır. Oda üyeleri yalnızca onaylı altyapıyı görür.
- Davetle atanan rolün şarkıcısı kendi zamanlı satırlarını sırayla kaydeder. Önizlemede ve kayıtta normal klibin kendi bölümünü orijinal sesiyle dinleyip şarkıcıya eşlik eder. Kulaklıktaki klip sesi ayarlanabilir; dosyaya yalnızca mikrofon akışı yazılır.
- Mikrofon izni ve kısa ses testi, tekrar kayıt, satır başına ±500 ms zaman düzeltmesi vardır. Kayıtlar özel bucket'ta saklanır; oda ilerlemesi kaydedilmiş satırlardan hesaplanır.
- Tüm rol satırları kaydedilince yönetici final video işini sıraya koyar. Windows yardımcısı FFmpeg ile klibin yalnız görüntüsünü, onaylı vokalsiz altyapıyı ve mikrofon kayıtlarını zaman çizelgesinde birleştirir. Final karışımında altyapı seviyesi düşürülür ve zayıf mikrofon bölümleri sınırlı dinamik normalizasyonla yükseltilir. Son MP4 özel depolamaya yüklenir.
- Kullanıcı sayfaları oturum ve RLS ile korunur. Yalnızca sunucudaki yerel yardımcı API'si service_role anahtarını kullanır; bu anahtar tarayıcıya veya Windows yardımcı programına verilmez. Özel yanıtlar ortak önbelleğe alınmaz.

İşlem başarısız olursa mikrofon kayıtları silinmez. 50 MB dosya ve toplam 1 GB özel depolama sınırları final video için de geçerlidir.

## GitHub'da kaynak kodunu paylaşma

Git deposu `site` klasöründedir. Kaynak kodu paylaşmak için bu klasörde Git kullan; bilgisayarındaki tüm proje klasörünü veya yedeğini elle yükleme. `.gitignore`, Git ile eklenen dosyaları filtreler; GitHub'ın web yükleme ekranına elle seçilen dosyalar için koruma sağlamaz.

- `.env.local`, gerçek anahtarlar, parolalar ve yerel ayarlar paylaşılmaz. `.env.example` yalnızca doldurulacak örnek değerleri içerir ve depoda kalır.
- Klipler, mikrofon kayıtları, altyapılar ve final videolar; günlükler, tarayıcı oturumları, veritabanı yedekleri, Python ortamı ve model dosyaları Git dışında tutulur. Private Supabase Storage içeriği GitHub'a aktarılmaz.
- `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ve `LOCAL_WORKER_TOKEN` yalnızca sunucu ortamında tutulur. Bu adları `NEXT_PUBLIC_` ile başlatma. Windows yardımcı programının tokenı Windows Credential Manager'da kalır.
- `supabase/migrations`, `supabase/bootstrap-admin.sql`, kurulum dosyaları, testler ve `package-lock.json` kaynak koduyla birlikte paylaşılır. `bootstrap-admin.sql` içindeki örnek adresi gerçek e-posta adresinle değiştirdiysen o değişikliği yayımlama.

Yüklemeden önce PowerShell'i `site` klasöründe açıp eklenen dosyaları gözden geçir:

```powershell
git status --short
git add .
git diff --cached --name-only
git diff --cached
```

Liste ve içerikte kişisel dosya veya gizli değer olmadığını kontrol et. Git dışında bırakılmış bir dosyayı zorla ekleme (`git add -f`). `.gitignore`, daha önce bir commit'e girmiş sırları geçmişten silmez; bir anahtar paylaşılmışsa ilgili hizmette iptal edip yenisini oluşturman gerekir. Kaynak kodunu GitHub'a koymak, çalışan siteyi otomatik olarak yayımlamaz.

## Supabase kurulumu

`.env.local` yerel ve Git dışında kalır. Kod, Supabase ayarları yapılmadan özel sayfaları açmaz.

1. Supabase projesinde SQL Editor'ü açıp şu dosyaları sırayla bir kez çalıştır:
   - `supabase/migrations/202609250001_private_studio.sql`
   - `supabase/migrations/202609250002_song_creation.sql`
   - `supabase/migrations/202609250003_song_studio_jobs.sql`
   - `supabase/migrations/202609260001_no_email_invites.sql`
   - `supabase/migrations/202609260002_worker_leases.sql`
   - `supabase/migrations/202609270001_worker_service_grants.sql`
   - `supabase/migrations/202609270002_room_recordings.sql`
   - `supabase/migrations/202609270003_room_render_jobs.sql`
   Bu dosyalar yeni Sahne şeması içindir. Aynı tabloların bulunduğu başka uygulama veritabanına kontrol etmeden uygulama. `studio-private` için ek herkese açık Storage politikaları tanımlama.
2. Authentication → Users bölümündeki yönetici hesabının şifresini belirle ve hesabın doğrulanmış olduğundan emin ol. `supabase/bootstrap-admin.sql` bu hesabı `admins` tablosuna eklemiş olmalı. Yönetici e-posta adresi sadece hesap adı olarak kullanılır; giriş e-postası gönderilmez.
3. Supabase Dashboard → Authentication → Sign In / Providers bölümünde **Allow anonymous sign-ins** seçeneğini aç. Arkadaşlar davet bağlantısını açtığında Supabase anonim oturum açar; e-posta sağlayıcısı veya SMTP gerekmez.
4. Yerelde ortam dosyasını oluştur:

   ```powershell
   cd C:\WebTasarım\site
   Copy-Item .env.example .env.local
   ```

   `.env.local` içine proje Connect/API ayarlarındaki URL ve **publishable** anahtarı gir:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://PROJE_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   APP_URL=http://localhost:3000
   ```

   Eski projelerde publishable yerine anon anahtarı kullanılabilir. **Service role, secret key veya veritabanı parolasını `NEXT_PUBLIC_` alanlarına koyma.** `.env.local` Git tarafından dışlanır. APP_URL arkadaşların erişeceği gerçek yayın adresi olmalıdır. Davetler, yöneticinin siteyi açtığı doğrulanmış adresle oluşturulur: localhost üzerinden yerel test daveti, HTTPS yayın adresinden uzaktaki arkadaşlar için davet oluşur. Aynı bilgisayardaki localhost/127.0.0.1 erişimi, isteğin hedefiyle birebir aynı adres ve porttaysa APP_URL tünel adresini gösterirken de çalışır. Tünel adresi değiştiğinde APP_URL değerini güncelleyip sunucuyu yeniden başlat.
5. Uygulamayı başlat:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

   [http://localhost:3000](http://localhost:3000) adresinde yönetici hesabın ve şifrenle giriş yap. Şarkı yönetiminden şarkıyı, rol sayısını, şarkıcı adlarını, söz zamanlarını ve klibi ekle. Düzenleme sayfasından vokal ayırma işini sıraya koyabilir veya kendi altyapını yükleyip onaylayabilirsin. Sonra oda oluşturup her arkadaş için oda daveti üret ve kendin paylaş.

Canlı yayında HTTPS ve doğru APP_URL kullan. Proxy/hosting gövde limitleri yükleme için en az 51 MB olmalı; bazı sunucusuz barındırıcıların daha düşük sınırları vardır. Bu sürüm dosyaları Next.js sunucusu üzerinden yükler.

### Arkadaşın kayıt yapması

Oda lobisi açıkken katılım, rol, kayıt ve final durumu yaklaşık üç saniyede bir kontrol edilir. Yalnızca değişiklik varsa ekranın verileri yenilenir; yeni katılanlar bildirimde ve bütün üyelerin görebildiği listede görünür. Arka plandaki sekmeler kontrol yapmaz, bağlantı kesilince otomatik yeniden denenir. Kontrol yanıtı yalnızca değişiklik özeti ve üye adlarını taşır; medya dosyası veya gizli anahtar içermez. `/api/rooms/[roomId]/updates` oturum ve mevcut oda erişim kurallarıyla korunur. SQL migration veya Supabase Realtime kurulumu gerekmez.

Mevcut Supabase projesini yeniden kurma. Eski migration'lar zaten uygulandıysa SQL Editor'da yalnızca henüz uygulanmamış migration dosyalarını sırayla çalıştır. Yönetici şarkı için normal klibi yükleyip oda davetleri oluşturabilir. Arkadaş bağlantıyı açıp adını girince odaya katılır; boş rollerden birini veya birkaçını alıp `/rooms/[roomId]/record` sayfasına geçer. Vokalsiz altyapı kayıt için gerekmez, ancak final video oluşturulmadan önce onaylanmalıdır.

Arkadaş önce kendi satırını normal klipte izler, mikrofonunu seçer ve **Doğal ses** ile **Gürültülü ortam** modlarında kısa test kayıtları yapıp karşılaştırır. Canlı ses göstergesi çok düşük veya çok yüksek giriş düzeyini fark etmesine yardım eder. Kulaklığını taktığını işaretledikten sonra orijinal kliple birlikte söyler; dosyaya yalnızca mikrofon akışı alınır. Kaydı dinleyip **Özel odaya kaydet** düğmesine basar. Satırlar kendi rolü içinde sırayla açılır. Kaydedilmiş satırı tekrar seçip yeniden söyleyebilir veya ±500 ms zaman kayması girebilir. Tarayıcı mikrofonu için HTTPS ya da aynı bilgisayarda `localhost` gerekir. Final renderda onaylı vokalsiz altyapı kullanılır.

Yönetici sözler için satır başlangıcı ve bitişi tanımladığı için karaoke kelime vurgusu satır süresine eşit yayılır; kelime başına kesin zamanlama bu veri modelinde yoktur.

Aynı bilgisayarda altı rolü denemek için `open-test-roles.cmd` dosyasına çift tıkla. Yönetici ekranından oluşturduğun `http://localhost:3000/invite#token=...` bağlantılarını sırayla yapıştır. Dosya tek Chrome/Edge kurulumuyla altı ayrı oturum penceresi açar; profilleri `%LOCALAPPDATA%\SahneTestRoles` altında saklar. Normal tarayıcı pencerendeki yönetici oturumu ayrı kalır.

### Final videoyu oluşturma

Eski migration'lar uygulandıysa **yalnızca** `supabase/migrations/202609270003_room_render_jobs.sql` dosyasını SQL Editor'da bir kez çalıştır. Bilgisayardaki yardımcı açık ise bildirim alanından **Çıkış** seçip `worker\start.cmd` dosyasını yeniden aç; yeni render kodu böyle yüklenir. Yardımcı kurulu değilse aşağıdaki kurulum adımlarını uygula.

Tüm rollerdeki söz satırları tamamlanınca yönetici özel odanın **Final video** sayfasında **Videoyu oluştur** düğmesine basar. İş bekliyorsa bilgisayar açılana kadar sırada kalır. Yardımcı klip, onaylı altyapı ve kaydedilmiş tüm sesleri indirir; kayıtların başlama ve ±500 ms düzeltme zamanlarını uygular. FFmpeg klibin eski vokalli sesini MP4'e katmaz. MP4 en fazla 720p ve 50 MB olacak şekilde sıkıştırılır. Çok uzun klip 50 MB'a sığmazsa anlaşılır hata gösterilir; ses kayıtları korunur. Finali yalnızca oda üyeleri süreli medya bağlantısıyla izler.

### Oda ve şarkı silme, rol sayısı

Mevcut Supabase projesini yeniden oluşturma. Supabase **SQL Editor** içinde şu dosyaların içeriğini **sırayla, her birini bir kez** çalıştır:

1. `supabase/migrations/202609270004_room_deletion.sql` — oda silme ve yeniden denenebilir Storage temizleme sırası.
2. `supabase/migrations/202609270005_song_deletion.sql` — odasız şarkıyı silme.
3. `supabase/migrations/202609270006_role_count.sql` — odasız şarkının rol sayısını değiştirme.
4. `supabase/migrations/202609270007_room_role_claims.sql` — oda daveti, çoklu rol seçimi ve yönetici üye/rol çıkarma.
5. `supabase/migrations/202609270008_lyric_video.sql` — eski lyric video ayarları; yeni kayıt akışı için gerekli değildir. Daha önce uygulandıysa geri almaya gerek yoktur.

**Kayıt sesi:** Kayıtta şarkının yüklenen normal klibi görüntüsü ve orijinal sesiyle oynar. Klip sesi kaydedilmez; kulaklık kullanılması sesin mikrofona sızmasını önler. Vokalsiz altyapı yalnızca final render için gereklidir. Daha önce ayarlanan YouTube lyric video bilgileri veritabanında kalabilir ancak kayıt ekranında kullanılmaz.

**Yeni oda davetleri:** Son migration'ı Supabase SQL Editor'da bir kez çalıştır. Eski rol bağlantılarının bekleyenleri geçersiz olur; daha önce katılan arkadaşların üyelikleri ve rol sahipliği korunur. Oda sayfasındaki **Oda daveti oluştur** ile her arkadaş için ayrı, tek kullanımlık bağlantı oluştur. Katılan kişi aynı odada birden fazla boş rol alabilir. Yönetici rol sahibini veya üyeyi çıkarırsa o rollere ait kayıtlar ve varsa eski final silinir; diğer rollerin kayıtları kalır. İşlenen final sırasında çıkarma engellenir. Storage temizliği tamamlanamazsa yönetici **Bekleyen dosyaları temizle** işlemini kullanır.

Yönetici oda sayfasında **Odayı sil** düğmesini kullanır. Oda adını aynen yazarak onaylar; mikrofon kayıtları ve final videolar kalıcı silinir, ortak şarkı klibi ve altyapı korunur. Bekleyen/işlenen video işi varken silme engellenir. Şarkı sayfasındaki **Şarkıyı sil** düğmesi, bağlı oda varsa veya vokal ayırma işi sürüyorsa engellenir. Şarkı silinince klip, altyapılar, roller ve sözler de silinir. Silme sonrası Storage bağlantısı başarısızsa dosya yolları temizleme sırasında kalır; yönetici **Şarkı yönetimi → Bekleyen dosyaları temizle** düğmesiyle tekrar dener. Bu dosyalar temizlenene kadar depolama kotasında yer tutabilir.

Şarkı düzenleme sayfasında rol sayısı 1–24 arasında değiştirilebilir. Bağlı oda varsa önce o odalar silinmelidir. Rol azaltma son numaralı rolleri ve onlara ait sözleri siler; ekranda önizleme ve ayrıca onay vardır.

Elle kontrol: (1) Bir odayı silip ana sayfa listesinden kaybolduğunu, aynı şarkının kaldığını gör. (2) Odaya bağlı şarkı silmenin engellendiğini, odayı kaldırdıktan sonra silinebildiğini gör. (3) Odasız şarkıda rol ekle ve azalt; mevcut ilk rollerin sözlerinin kaldığını kontrol et. (4) Arkadaş oturumunda silme ve rol sayısı işlemlerinin görünmediğini ve API çağrılarının `403` döndüğünü kontrol et.

## Ekranlar

- `/login` — yalnızca yönetici için şifreyle giriş.
- `/invite#token=...` — e-posta gerektirmeyen, tek kullanımlık oda daveti. Token URL fragment'inde olduğu için HTTP URL'sine/referrer'a eklenmez. Form gönderiminde sunucuya iletilir. Veritabanında yalnızca SHA-256 özeti tutulur.
- `/` — yalnızca üyesi olunan odalar.
- `/admin/songs` — yönetici şarkı kitaplığı.
- `/admin/songs/new` — şarkı, klip, rol sayısı, şarkıcılar ve zamanlı sözler.
- `/admin/songs/[songId]` — rol, söz, klip, vokal ayırma işi, altyapı onayı ve oda oluşturma.
- `/rooms/[roomId]` — üyelikle korunan oda, boş rol seçimi, oda daveti ve yönetici üye/rol yönetimi.
- `/rooms/[roomId]/record` — alınan roller arasında geçiş, normal klipte ilgili bölümü önizleme ve kliple kayıt, dinleme, tekrar kayıt ve zaman düzeltmesi.
- `/rooms/[roomId]/final` — yönetici render düğmesi, iş durumu ve oda üyelerine özel final video.
- `/api/media/[id]` — oturum + RLS sonrası 5 dakikalık URL'ye yönlendirme.
- `/api/media/upload` — yönetici ve kaynak kontrolüyle özel dosya yükleme.
- `/api/rooms/[roomId]/recordings` — alınan rol ve sıra denetimiyle mikrofon kaydını özel depolamaya yazma ve zaman kayması güncelleme.
- `/api/rooms/[roomId]/roles` ve `/members` — rol alma; yönetici için rolü boşaltma veya üyeyi çıkarma.
- `/api/rooms/[roomId]/render` — oda üyeleri için durum, yönetici için iş oluşturma.

## Windows yardımcı programını kurma

Yardımcı program senin Windows bilgisayarında çalışır. Bilgisayar kapalıyken işler Supabase'de bekler. Arkadaşların çevrimiçi kullanacaksa site dışarıdan erişilebilir HTTPS adresinde olmalı. `localhost` yalnızca aynı bilgisayardaki geliştirme içindir. Gelen bağlantı portu açılmaz.

1. Yukarıdaki migration'ları sırayla uygula. Eski dosyalar zaten çalıştıysa yalnızca henüz uygulamadığın dosyaları çalıştır. Özellikle **202609270001_worker_service_grants.sql** yardımcı programın iş durumunu güncellemesi ve sonuç yüklemesi için gereklidir. Sonuç `Success` olmalı.
2. `install.cmd`, Python 3.11 64 bit kurulu değilse Windows paket yöneticisi `winget` ile kurmayı dener. Bu başarısız olursa [Python 3.11 Windows 64 bit kurulumunu](https://www.python.org/downloads/release/python-3119/) elle yap; **Add python.exe to PATH** ve **Python launcher** seçeneklerini açık bırak. PowerShell'de `py -3.11 --version` komutuyla kontrol et.
3. Supabase Dashboard'da **Project Settings → API Keys** bölümünü aç. **Secret keys** altında `sb_secret_...` anahtarın varsa onu kullan; yoksa **Create new API keys** ile oluştur. Sitenin `.env.local` dosyasına `SUPABASE_SECRET_KEY=...` olarak ekle. Eski projede yalnızca `service_role` anahtarı görünüyorsa onu `SUPABASE_SERVICE_ROLE_KEY=...` adıyla ekleyebilirsin. `LOCAL_WORKER_TOKEN` için PowerShell'de şu komutları çalıştır ve çıkan 64 karakterlik değeri aynı dosyaya yaz:

   ```powershell
   $workerBytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($workerBytes)
   [BitConverter]::ToString($workerBytes).Replace('-', '')
   ```

   `.env.local` içine seçtiğin sunucu anahtarı değişkenini (`SUPABASE_SECRET_KEY=...` veya eski `SUPABASE_SERVICE_ROLE_KEY=...`) ve `LOCAL_WORKER_TOKEN=...` satırlarını yaz. Bunları `NEXT_PUBLIC_` alanlarına, tarayıcı koduna veya Git'e koyma. Sunucuyu `npm.cmd run dev` ile yeniden başlat. Siteyi barındırıyorsan aynı değerleri barındırma hizmetinin gizli sunucu değişkenlerine ekle.

Windows “Uygulama Denetimi ilkesi” Next.js SWC yerel dosyasını engellerse Turbopack açılmaz. Projedeki `dev` ve `build` komutları bu yüzden Next.js'in Webpack seçeneğini kullanır; aynı `npm.cmd run dev` komutuyla devam et.
4. Dosya Gezgini'nde `C:\WebTasarım\site\worker\install.cmd` dosyasına çift tıkla. `.venv` içinde gerekli paketler ve FFmpeg kurulur. PyTorch, Demucs ve model indirmeleri büyük olabilir. Yönetici izni gerekmez.
5. Açılan pencerede site adresini (`https://...`; aynı PC'de geliştirmede `http://localhost:3000`) ve 3. adımda ürettiğin `LOCAL_WORKER_TOKEN` değerini gir. Token Windows Credential Manager'da saklanır; ayar dosyasında yalnızca site adresi bulunur. Yardımcı Windows oturumu açıldığında otomatik başlar.
6. Bildirim alanındaki Sahne simgesini gör. Sitede şarkının **Vokali ayır** düğmesine bas. İş durumu 15 saniyede bir yenilenir. Hazır olduğunda altyapıyı dinleyip **Bu altyapıyı onayla** düğmesine bas.

Yardımcıyı elle açmak için `worker\start.cmd`, site adresini veya tokenı değiştirmek için `worker\configure.cmd` kullan. Windows ile otomatik açılmasını kapatmak için `worker\disable-startup.cmd` dosyasını çalıştır. Ayar değişikliğinden sonra bildirim menüsünden çıkıp `worker\start.cmd` ile yeniden aç. Bildirim menüsünde duraklat ve çıkış bulunur; çıkış sürmekte olan iş bitince olur. Günlük `%LOCALAPPDATA%\SahneWorker\worker.log` yolundadır; token ve klip bağlantısı yazılmaz. Bilgisayar iş sırasında kapanırsa yardımcı tekrar bağlandığında 5 dakikayı aşan yarım işi yeniden beklemeye alır; en fazla üç denemeden sonra hata gösterir.

Kurulum internetten ücretsiz bağımlılıklar indirir. Demucs CPU üzerinde çalışır. [Demucs Windows yönergeleri](https://github.com/facebookresearch/demucs/blob/main/docs/windows.md) FFmpeg gereksinimini açıklar; proje artık bakım almadığını [belirtiyor](https://github.com/facebookresearch/demucs/blob/main/README.md). Sitede elle altyapı yükleme seçeneği de vardır.

### Yardımcı program API'si

- `POST /api/local-worker/jobs/claim` — `Authorization: Bearer <LOCAL_WORKER_TOKEN>` ile tek işi atomik alır. Boş sıra `204` döner; işte `job_id`, denemeye özgü `lease_id` ve beş dakikalık kaynak klip bağlantısı bulunur.
- `POST /api/local-worker/jobs/{jobId}/heartbeat` — bearer ve `X-Worker-Lease: <lease_id>` ile işin sürdüğünü bildirir.
- `POST /api/local-worker/jobs/{jobId}/result` — aynı başlıklarla `multipart/form-data` içindeki `file` alanına en fazla 50 MB MP3 yükler; iş `ready` olur. Yönetici onaylayana kadar oda üyelerine görünmez.
- `POST /api/local-worker/jobs/{jobId}/fail` — aynı başlıklarla kısa hata yollar; iş `error` olur.

Servis anahtarı yalnızca sunucuda kalır. Deneme kimliği eski bir yardımcının yarım kalmış işe sonuç yazmasını engeller.

Render işleri aynı `LOCAL_WORKER_TOKEN` ile `/api/local-worker/render-jobs/claim` ve `/api/local-worker/render-jobs/{jobId}/{heartbeat,result,fail}` uçlarını kullanır. İşe özel lease gerekir. Kaynak bağlantıları yalnızca yardımcıya verilir ve 30 dakika geçerlidir; final video oda üyeleri için `/api/media/[id]` üzerinden 5 dakikalık bağlantıyla açılır.

Eski `/rooms/daha-iyi` örnek rotası kaldırıldı; odalar veritabanı kimliğiyle açılır. Örnek arkadaşlar/kayıt durumları gerçek veri gibi gösterilmez.

## Erişim modelinin sınırları

Private bucket URL'si tek başına dosyayı açmaz. Ancak üretilmiş imzalı URL, süresi boyunca onu elinde tutan kişiye erişim verir; üyeyi çıkarmak mevcut URL'yi anında iptal etmez. En geç 5 dakika sonra yeni bağlantı için tekrar üyelik gerekir. İzlenen/indirilen dosyanın kopyalanması engellenemez.

Anonim oturum açmış davetsiz biri bile RLS nedeniyle oda, şarkı ve medya göremez. Yönetici yetkisi user_metadata'dan alınmaz; yalnızca SQL Editor gibi güvenilir yönetim yollarıyla yazılabilen `admins` tablosundan okunur. Arkadaş oturumu aynı tarayıcıda kalır; tarayıcı verileri silinirse anonim hesaba erişim kaybolur ve yeniden davet gerekir. Çıkarılan üyenin yeni medya bağlantısı alması RLS tarafından engellenir; daha önce açılmış süreli bağlantı en fazla beş dakika geçerli olabilir.

## Kontroller

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:access
```

`test:access`, ilk iki migration'ın eski e-posta daveti erişim kurallarını PGlite PostgreSQL motorunda denetler. Yeni bağlantı daveti akışı ayrıca dört migration birlikte çalıştırılarak yerel PostgreSQL'de kontrol edildi; canlı Supabase ayarları yine ayrı doğrulanmalıdır.

Bu kontrol gerçek Supabase anonim oturumunu, şifreyle girişini veya Storage imzalı URL HTTP doğrulamasını kapsamaz. Proje bağlandıktan sonra iki ayrı tarayıcı oturumuyla yönetici ve arkadaş akışını, üçüncü davetsiz hesapla 404/erişim reddini ve dosya bağlantısının süre sonunda yenilenmesini ayrıca doğrula.

## Resmî kaynaklar

- [Supabase Next.js oturum yönetimi](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [PostgreSQL RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage erişim kontrolü](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase anonim oturumlar](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase şifreyle giriş](https://supabase.com/docs/guides/auth/passwords)
