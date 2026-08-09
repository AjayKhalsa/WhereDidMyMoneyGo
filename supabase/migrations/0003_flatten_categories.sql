-- Flatten the category tree: 10 groups / 46 leaves -> 11 flat categories,
-- no subcategories. Finer detail (what specifically happened) moves to the
-- separate `contexts` dimension instead of forking the category — see
-- src/lib/domain/categories.ts and src/lib/data/category-migration.ts.
--
-- This SQL mapping is a hand-copy of LEGACY_CATEGORY_MAP in
-- src/lib/data/category-migration.ts (which also runs client-side as a
-- self-healing migration on every boot) — keep the two in sync if that
-- table ever changes.
--
-- Note: `categories.id` is a global primary key, not scoped per user, so
-- step 1's `on conflict (id) do nothing` only behaves correctly with a
-- single real user (true today). A second real user would silently not get
-- their own copy of any category id another user already claimed — a
-- pre-existing limitation of the schema, not introduced by this migration,
-- and out of scope to fix here.
--
-- Run this once in the Supabase SQL editor.

-- Step 1: insert the 11 new flat categories for every user_id that already
-- has category rows, so the FK target exists before anything is repointed
-- at it. 7 of the 11 ids already exist unchanged as group rows (essentials,
-- transport, dining, shopping, bills, health, entertainment) and are
-- skipped by ON CONFLICT; travel/education/gifts/other are the genuinely
-- new rows.
insert into categories (id, user_id, name, parent_id, "order", system)
select new_cats.new_id, u.user_id, new_cats.new_name, null, new_cats.new_order, true
from (select distinct user_id from categories) u
cross join (values
  ('essentials', 'Essentials', 0),
  ('transport', 'Transport', 1),
  ('travel', 'Travel', 2),
  ('dining', 'Food & Dining', 3),
  ('shopping', 'Shopping', 4),
  ('entertainment', 'Entertainment', 5),
  ('bills', 'Bills & Subscriptions', 6),
  ('health', 'Health & Fitness', 7),
  ('education', 'Education', 8),
  ('gifts', 'Gifts', 9),
  ('other', 'Other', 10)
) as new_cats(new_id, new_name, new_order)
on conflict (id) do nothing;

-- Step 2a: travel-flavored uncategorised rows recover their real category
-- (Travel didn't exist as a bucket under the old tree) instead of
-- collapsing into "other" like every other legacy uncategorised row.
-- Must run before step 2b's blanket misc.other -> other mapping.
update transactions t set category_id = 'travel'
where t.category_id = 'misc.other'
  and exists (
    select 1 from transaction_contexts tc
    where tc.transaction_id = t.id and tc.type = 'OCCASION' and tc.value = 'travel'
  );

-- Step 2b: remap every remaining legacy category_id, identically across
-- transactions, rules, and recurring.
update transactions set category_id = case category_id
  when 'essentials.groceries' then 'essentials'
  when 'essentials.diet' then 'essentials'
  when 'essentials.toiletries' then 'essentials'
  when 'essentials.skincare' then 'essentials'
  when 'essentials.medicines' then 'essentials'
  when 'essentials.other' then 'essentials'
  when 'transport.cab' then 'transport'
  when 'transport.metro' then 'transport'
  when 'transport.fuel' then 'transport'
  when 'transport.parking' then 'transport'
  when 'transport.other' then 'transport'
  when 'dining.restaurant' then 'dining'
  when 'dining.delivery' then 'dining'
  when 'dining.cafe' then 'dining'
  when 'dining.takeaway' then 'dining'
  when 'dining.drinks' then 'dining'
  when 'dating.dining' then 'dining'
  when 'dating.drinks' then 'dining'
  when 'dating.movies' then 'entertainment'
  when 'dating.activities' then 'entertainment'
  when 'dating.gifts' then 'gifts'
  when 'dating.other' then 'other'
  when 'social.dining' then 'dining'
  when 'social.drinks' then 'dining'
  when 'social.parties' then 'entertainment'
  when 'social.events' then 'entertainment'
  when 'social.other' then 'other'
  when 'entertainment.movies' then 'entertainment'
  when 'entertainment.ott' then 'entertainment'
  when 'entertainment.games' then 'entertainment'
  when 'entertainment.events' then 'entertainment'
  when 'entertainment.other' then 'entertainment'
  when 'bills.mobile' then 'bills'
  when 'bills.internet' then 'bills'
  when 'bills.utilities' then 'bills'
  when 'bills.subscriptions' then 'bills'
  when 'bills.rent' then 'bills'
  when 'bills.other' then 'bills'
  when 'shopping.clothes' then 'shopping'
  when 'shopping.electronics' then 'shopping'
  when 'shopping.home' then 'shopping'
  when 'shopping.personal' then 'gifts'
  when 'shopping.other' then 'shopping'
  when 'health.gym' then 'health'
  when 'health.doctor' then 'health'
  when 'health.wellness' then 'health'
  when 'health.other' then 'health'
  when 'misc.other' then 'other'
  when 'misc' then 'other'
  when 'dating' then 'other'
  when 'social' then 'other'
  else category_id
end
where category_id is not null and category_id like '%.%'
   or category_id in ('misc', 'dating', 'social');

update rules set category_id = case category_id
  when 'essentials.groceries' then 'essentials'
  when 'essentials.diet' then 'essentials'
  when 'essentials.toiletries' then 'essentials'
  when 'essentials.skincare' then 'essentials'
  when 'essentials.medicines' then 'essentials'
  when 'essentials.other' then 'essentials'
  when 'transport.cab' then 'transport'
  when 'transport.metro' then 'transport'
  when 'transport.fuel' then 'transport'
  when 'transport.parking' then 'transport'
  when 'transport.other' then 'transport'
  when 'dining.restaurant' then 'dining'
  when 'dining.delivery' then 'dining'
  when 'dining.cafe' then 'dining'
  when 'dining.takeaway' then 'dining'
  when 'dining.drinks' then 'dining'
  when 'dating.dining' then 'dining'
  when 'dating.drinks' then 'dining'
  when 'dating.movies' then 'entertainment'
  when 'dating.activities' then 'entertainment'
  when 'dating.gifts' then 'gifts'
  when 'dating.other' then 'other'
  when 'social.dining' then 'dining'
  when 'social.drinks' then 'dining'
  when 'social.parties' then 'entertainment'
  when 'social.events' then 'entertainment'
  when 'social.other' then 'other'
  when 'entertainment.movies' then 'entertainment'
  when 'entertainment.ott' then 'entertainment'
  when 'entertainment.games' then 'entertainment'
  when 'entertainment.events' then 'entertainment'
  when 'entertainment.other' then 'entertainment'
  when 'bills.mobile' then 'bills'
  when 'bills.internet' then 'bills'
  when 'bills.utilities' then 'bills'
  when 'bills.subscriptions' then 'bills'
  when 'bills.rent' then 'bills'
  when 'bills.other' then 'bills'
  when 'shopping.clothes' then 'shopping'
  when 'shopping.electronics' then 'shopping'
  when 'shopping.home' then 'shopping'
  when 'shopping.personal' then 'gifts'
  when 'shopping.other' then 'shopping'
  when 'health.gym' then 'health'
  when 'health.doctor' then 'health'
  when 'health.wellness' then 'health'
  when 'health.other' then 'health'
  when 'misc.other' then 'other'
  when 'misc' then 'other'
  when 'dating' then 'other'
  when 'social' then 'other'
  else category_id
end
where category_id like '%.%' or category_id in ('misc', 'dating', 'social');

update recurring set category_id = case category_id
  when 'essentials.groceries' then 'essentials'
  when 'essentials.diet' then 'essentials'
  when 'essentials.toiletries' then 'essentials'
  when 'essentials.skincare' then 'essentials'
  when 'essentials.medicines' then 'essentials'
  when 'essentials.other' then 'essentials'
  when 'transport.cab' then 'transport'
  when 'transport.metro' then 'transport'
  when 'transport.fuel' then 'transport'
  when 'transport.parking' then 'transport'
  when 'transport.other' then 'transport'
  when 'dining.restaurant' then 'dining'
  when 'dining.delivery' then 'dining'
  when 'dining.cafe' then 'dining'
  when 'dining.takeaway' then 'dining'
  when 'dining.drinks' then 'dining'
  when 'dating.dining' then 'dining'
  when 'dating.drinks' then 'dining'
  when 'dating.movies' then 'entertainment'
  when 'dating.activities' then 'entertainment'
  when 'dating.gifts' then 'gifts'
  when 'dating.other' then 'other'
  when 'social.dining' then 'dining'
  when 'social.drinks' then 'dining'
  when 'social.parties' then 'entertainment'
  when 'social.events' then 'entertainment'
  when 'social.other' then 'other'
  when 'entertainment.movies' then 'entertainment'
  when 'entertainment.ott' then 'entertainment'
  when 'entertainment.games' then 'entertainment'
  when 'entertainment.events' then 'entertainment'
  when 'entertainment.other' then 'entertainment'
  when 'bills.mobile' then 'bills'
  when 'bills.internet' then 'bills'
  when 'bills.utilities' then 'bills'
  when 'bills.subscriptions' then 'bills'
  when 'bills.rent' then 'bills'
  when 'bills.other' then 'bills'
  when 'shopping.clothes' then 'shopping'
  when 'shopping.electronics' then 'shopping'
  when 'shopping.home' then 'shopping'
  when 'shopping.personal' then 'gifts'
  when 'shopping.other' then 'shopping'
  when 'health.gym' then 'health'
  when 'health.doctor' then 'health'
  when 'health.wellness' then 'health'
  when 'health.other' then 'health'
  when 'misc.other' then 'other'
  when 'misc' then 'other'
  when 'dating' then 'other'
  when 'social' then 'other'
  else category_id
end
where category_id is not null
  and (category_id like '%.%' or category_id in ('misc', 'dating', 'social'));

-- Step 3: delete the old rows now that nothing references them. Leaves
-- first (they hold the parent_id FK), then the 3 dead bare group rows that
-- have no new-tree equivalent (misc/dating/social) — the other 7 old group
-- rows (essentials, transport, dining, shopping, bills, health,
-- entertainment) are kept as-is, reused unchanged by the new flat tree.
delete from categories where id like '%.%';
delete from categories where id in ('misc', 'dating', 'social');
