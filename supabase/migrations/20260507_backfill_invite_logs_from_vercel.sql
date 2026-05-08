-- Backfill invite sends recovered from Vercel runtime logs.
-- This is safe to run repeatedly: it only inserts invite/sent rows that are
-- not already present in email_outreach_log.

insert into public.email_outreach_log (email, kind, status, sent_by, created_at)
select recovered.email, 'invite', 'sent', 'vercel-log-backfill', now()
from (
  values
    ('abhishek.enaguthi@pcc.edu'),
    ('adityashyam28@gmail.com'),
    ('ajinkyagokule@gmail.com'),
    ('brycetruong@gmail.com'),
    ('d.varma8774@gmail.com'),
    ('dhaya.nadhana@gmail.com'),
    ('dhushmk@gmail.com'),
    ('eabhishek2004@gmail.com'),
    ('eabhishek2005@gmail.com'),
    ('enagutha@oregonstate.edu'),
    ('enaguthia@gmail.com'),
    ('enaguthiabhishek2004@gmail.com'),
    ('enaguthiabhishek@gmail.com'),
    ('evasu.sapsd@gmail.com'),
    ('hendeross@gmail.com'),
    ('intim@oregonstate.edu'),
    ('josiahliebert@gmail.com'),
    ('kaveeom@gmail.com'),
    ('kavitha.enaguthi@gmail.com'),
    ('lucasjm0323@gmail.com'),
    ('meetashwin2000@gmail.com'),
    ('meetnraval@gmail.com'),
    ('muralikinti@gmail.com'),
    ('patenira@oregonstate.edu'),
    ('rajansaranya176@gmail.com'),
    ('sarveshthiruppathi@gmail.com'),
    ('shah.harshil187@gmail.com'),
    ('snehasannidhi97@gmail.com'),
    ('srijapalla1960@gmail.com'),
    ('tejassrirama1@gmail.com')
) as recovered(email)
where not exists (
  select 1
  from public.email_outreach_log existing
  where lower(existing.email) = lower(recovered.email)
    and existing.kind = 'invite'
    and existing.status = 'sent'
);
