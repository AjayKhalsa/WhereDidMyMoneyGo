begin;
-- Add the requested Auto leaf only where the Transport group is unambiguous
-- and no equivalent user category exists. No existing IDs/labels are changed.
insert into public.categories(id,user_id,name,parent_id,"order",system)
select p.id||'.auto',p.user_id,'Auto',p.id,
 coalesce((select max(c."order")+1 from public.categories c where c.parent_id=p.id and c.user_id=p.user_id),0),true
from public.categories p where p.parent_id is null
 and (p.id='transport' or regexp_replace(lower(p.name),'[^a-z0-9]','','g')='transport')
 and (select count(*) from public.categories root where root.user_id=p.user_id and root.parent_id is null and (root.id='transport' or regexp_replace(lower(root.name),'[^a-z0-9]','','g')='transport'))=1
 and not exists(select 1 from public.categories c where c.user_id=p.user_id and c.parent_id=p.id
  and regexp_replace(lower(c.name),'[^a-z0-9]','','g') in ('auto','autorickshaw','rickshaw','autocab'))
on conflict(user_id,id) do nothing;

commit;
