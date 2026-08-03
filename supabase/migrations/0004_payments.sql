-- §11 결제 (T12) — PAYMENTS_ENABLED 플래그로 클라이언트에서 격리
create or replace function public.redeem_season_pass(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare credit_id uuid;
begin
  if not exists (select 1 from seasons s join groups g on g.id = s.group_id
                 where s.id = sid and g.owner_id = auth.uid())
    then raise exception 'OWNER_ONLY'; end if;
  select id into credit_id from subscriptions
   where user_id = auth.uid() and product_id = 'fine_season_pass_4w'
     and season_id is null and status = 'paid'
   order by created_at limit 1 for update;
  if credit_id is null then raise exception 'NO_CREDIT'; end if;
  update subscriptions set season_id = sid where id = credit_id;
  update seasons set paid = true where id = sid;
end $$;
