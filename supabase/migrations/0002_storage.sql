insert into storage.buckets (id, name, public)
values ('checkins', 'checkins', false)
on conflict (id) do nothing;

-- 경로 규약: checkins/{season_id}/{user_id}/{uuid}.jpg
create policy checkin_photo_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checkins'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_season_member(((storage.foldername(name))[1])::uuid)
  );

create policy checkin_photo_read on storage.objects for select to authenticated
  using (
    bucket_id = 'checkins'
    and public.is_season_member(((storage.foldername(name))[1])::uuid)
  );
-- update/delete 정책 없음 = 클라이언트 수정·삭제 불가 (파기는 §6.4 배치)
