import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// Execute the actual migrations in PostgreSQL. Only Supabase-owned schemas are stubbed.
const db = new PGlite({ extensions: { pgcrypto } });
let checks = 0;
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const count = async table => Number(await scalar(`select count(*) from ${table}`));
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
async function denied(sql, args = []) {
  await assert.rejects(db.query(sql, args)); checks++;
}
async function actor(id = '', role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  if (role) await db.exec(`set role ${role}`);
}
const admin = '10000000-0000-4000-8000-000000000001';
const friend = '10000000-0000-4000-8000-000000000002';
const stranger = '10000000-0000-4000-8000-000000000003';
const unverified = '10000000-0000-4000-8000-000000000004';

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, storage, extensions to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  for (const file of ['202609250001_private_studio.sql','202609250002_song_creation.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  for (const [id, email, confirmed] of [[admin,'admin@example.com',true],[friend,'friend@example.com',true],[stranger,'stranger@example.com',true],[unverified,'unverified@example.com',false]]) {
    await db.query('insert into auth.users values($1,$2,$3)', [id,email,confirmed ? new Date().toISOString() : null]);
  }
  await db.query('insert into public.admins values($1)', [admin]);
  check(await scalar("select public from storage.buckets where id = 'studio-private'"), false, 'Bucket must be private');
  await actor(admin);
  const song = await scalar("select public.create_studio_song('Daha İyi','Manifest',198)");
  const otherSong = await scalar("select public.create_studio_song('Başka şarkı','Grup',200)");
  const room = await scalar("select public.create_studio_room($1,'Bizim Sahne')", [song]);
  const otherRoom = await scalar("select public.create_studio_room($1,'Başka Oda')", [otherSong]);
  const siblingRoom = await scalar("select public.create_studio_room($1,'Aynı şarkı, farklı oda')", [song]);
  check(await count('public.room_members'), 3, 'Creator joins their rooms');
  const roles = (await db.query('select id from public.song_roles where song_id=$1 order by position', [song])).rows.map(r => r.id);
  const otherRole = await scalar('select id from public.song_roles where song_id=$1 limit 1', [otherSong]);
  check(roles.length, 6, 'Six roles are created atomically');
  await db.query("insert into public.lyrics(role_id,start_ms,end_ms,text) values($1,1000,4000,'Söz')", [roles[0]]);
  await denied("insert into public.lyrics(role_id,start_ms,end_ms,text) values($1,1000,200000,'Geçersiz')", [roles[0]]);
  await denied("select public.create_room_invite($1,$2,'friend@example.com')", [room, otherRole]);
  const replaced = await scalar("select public.create_room_invite($1,$2,'friend@example.com')", [room,roles[0]]);
  const token = await scalar("select public.create_room_invite($1,$2,'friend@example.com')", [room,roles[0]]);
  check(token.length, 64, 'Invitation uses a 256-bit token');
  check(await scalar('select token_hash = $1 from public.room_invites where token_hash=encode(extensions.digest($1,\'sha256\'),\'hex\')',[token]), false, 'Only a hash is stored');
  for (const [songId, roomId, kind, path] of [[song,null,'clip','song/clip'],[otherSong,null,'clip','other/clip'],[null,room,'final','room/final'],[null,otherRoom,'final','other/final'],[null,siblingRoom,'final','sibling/final']]) {
    await db.query('insert into public.media_assets(song_id,room_id,kind,object_path,label) values($1,$2,$3,$4,$4)', [songId,roomId,kind,path]);
    await db.query("insert into storage.objects(bucket_id,name) values('studio-private',$1)",[path]);
  }
  await denied("insert into storage.objects(bucket_id,name) values('studio-private','unregistered/file')");
  await actor('', 'anon');
  await denied('select * from public.rooms');
  await denied('select * from public.songs');
  await denied('select * from public.room_invites');
  await denied('select public.accept_room_invite($1,\'Anon\')', [token]);
  check(await count('storage.objects'), 0, 'Anonymous cannot access objects');
  check(await scalar("select public.invite_matches($1,'friend@example.com')", [token]), true, 'Valid email-bound invitation');
  check(await scalar("select public.invite_matches($1,'stranger@example.com')", [token]), false, 'Wrong email rejected');
  check(await scalar("select public.invite_matches($1,'friend@example.com')", [replaced]), false, 'Old invitation revoked');
  await actor(stranger);
  for (const table of ['rooms','songs','song_roles','lyrics','room_members','room_invites','media_assets']) check(await count(`public.${table}`),0,`Outsider cannot read ${table}`);
  check(await count('storage.objects'),0,'Outsider cannot read objects');
  await denied('insert into public.admins values($1)', [stranger]);
  await denied("select public.create_studio_song('X','Y',100)");
  await denied("select public.create_studio_room($1,'X')",[song]);
  await denied("insert into public.room_members(room_id,song_id,user_id,role_id,display_name) values($1,$2,$3,$4,'Fake')",[room,song,stranger,roles[0]]);
  await denied("select public.accept_room_invite($1,'Wrong person')",[token]);
  await denied("select public.create_room_invite($1,$2,'stranger@example.com')",[room,roles[1]]);
  await actor(friend);
  check(await scalar("select public.accept_room_invite($1,'Elif')",[token]),room,'Friend joins their assigned room');
  await denied("select public.accept_room_invite($1,'Elif')",[token]);
  check(await count('public.rooms'),1,'Only joined room is visible');
  check(await count('public.songs'),1,'Only room song is visible');
  check(await count('public.song_roles'),6,'Only room roles are visible');
  check(await count('public.lyrics'),1,'Only room lyrics are visible');
  check(await count('public.room_invites'),0,'Member cannot list private invitation emails/hashes');
  check(await count('public.media_assets'),2,'Song and final assets are visible to member');
  check(await count('storage.objects'),2,'Storage obeys membership');
  check((await db.query('select id from public.rooms where id=$1',[siblingRoom])).rows.length,0,'Sharing a song does not grant access to another room');
  check((await db.query("select id from storage.objects where name='sibling/final'")).rows.length,0,'Sharing a song does not expose another room final');
  await denied("insert into public.lyrics(role_id,start_ms,end_ms,text) values($1,8000,9000,'Forged')",[roles[0]]);
  await denied("insert into public.media_assets(song_id,kind,object_path,label) values($1,'clip','fake','fake')",[song]);
  await denied("insert into storage.objects(bucket_id,name) values('studio-private','song/clip')");
  check((await db.query("update public.song_roles set name='Forged' where id=$1 returning id",[roles[0]])).rows.length,0,'Member cannot edit roles');
  await denied('update public.room_members set role_id=$1 where user_id=$2',[roles[1],friend]);
  await actor(admin);
  await denied("select public.create_room_invite($1,$2,'stranger@example.com')",[room,roles[0]]);
  const duplicate = await scalar("select public.create_room_invite($1,$2,'friend@example.com')",[room,roles[1]]);
  await actor(friend);
  await denied("select public.accept_room_invite($1,'Elif')",[duplicate]);
  await actor(admin);
  const expired = await scalar("select public.create_room_invite($1,$2,'stranger@example.com')",[room,roles[2]]);
  const revoked = await scalar("select public.create_room_invite($1,$2,'stranger@example.com')",[otherRoom,otherRole]);
  const revokeId = await scalar("select id from public.room_invites where token_hash=encode(extensions.digest($1,'sha256'),'hex')",[revoked]);
  await db.query('select public.revoke_room_invite($1)',[revokeId]);
  const unconfirmedToken = await scalar("select public.create_room_invite($1,$2,'unverified@example.com')",[room,roles[3]]);
  await actor('',null);
  await db.query("update public.room_invites set expires_at=now()-interval '1 second' where token_hash=encode(extensions.digest($1,'sha256'),'hex')",[expired]);
  await actor(stranger);
  await denied("select public.accept_room_invite($1,'Late')",[expired]);
  await denied("select public.accept_room_invite($1,'Revoked')",[revoked]);
  await actor(unverified);
  await denied("select public.accept_room_invite($1,'Unverified')",[unconfirmedToken]);
  await actor('',null);
  await db.query('delete from public.room_members where user_id=$1',[friend]);
  await actor(friend);
  check(await count('public.rooms'),0,'Removed member loses room access');
  check(await count('public.media_assets'),0,'Removed member loses media metadata access');
  check(await count('storage.objects'),0,'Removed member cannot request new media URLs');
  await actor(admin);
  const ownInvite = await scalar("select public.create_room_invite($1,$2,'admin@example.com')",[room,roles[4]]);
  check(await scalar("select public.accept_room_invite($1,'Yönetici')",[ownInvite]),room,'Administrator can also claim one singer role');
  check(await scalar('select role_id from public.room_members where room_id=$1 and user_id=$2',[room,admin]),roles[4],'Creator membership receives the assigned role');
  console.log(`${checks} access-control checks passed (actual migrations, local PostgreSQL).`);
} finally { await db.close(); }
