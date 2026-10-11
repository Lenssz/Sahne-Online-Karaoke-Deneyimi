export type RoleStatus = "complete" | "recording" | "waiting";

export type SingerRole = {
  id: number;
  roleId?: string;
  name: string;
  member: string;
  initials: string;
  color: string;
  status: RoleStatus;
  part: string;
};

export const song = {
  title: "Daha İyi",
  artist: "Manifest",
  duration: "03:18",
  roomName: "Bizim Sahne",
};

export const roles: SingerRole[] = [
  { id: 1, name: "Esin", member: "Sen", initials: "S", color: "#ad96ff", status: "complete", part: "Açılış" },
  { id: 2, name: "Hilal", member: "Elif", initials: "E", color: "#ff928b", status: "complete", part: "1. nakarat" },
  { id: 3, name: "3. rol", member: "Deniz", initials: "D", color: "#8ad7c8", status: "complete", part: "2. bölüm" },
  { id: 4, name: "4. rol", member: "Ege", initials: "E", color: "#ffc48a", status: "recording", part: "Köprü" },
  { id: 5, name: "5. rol", member: "Davet bekleniyor", initials: "5", color: "#83b9ff", status: "waiting", part: "Son nakarat" },
  { id: 6, name: "6. rol", member: "Davet bekleniyor", initials: "6", color: "#e7a4d6", status: "waiting", part: "Kapanış" },
];

export const completedCount = roles.filter((role) => role.status === "complete").length;

export const demoLyrics = [
  { time: "00:32", text: "Burada Esin'in söyleyeceği sözler görünecek", active: false },
  { time: "00:38", text: "Şarkı ilerledikçe ilgili satır vurgulanacak", active: true },
  { time: "00:44", text: "Bir sonraki satır burada belirecek", active: false },
];
