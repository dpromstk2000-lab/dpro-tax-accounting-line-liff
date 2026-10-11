-- R10.1 disposable PostgreSQL 17 fixture. Synthetic records ONLY.
-- This file is deliberately incompatible with production: never run on Supabase.
DO $$ BEGIN
 IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'R101_ISOLATION_DB_NAME_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth')
    OR EXISTS(SELECT 1 FROM pg_class WHERE relname='taxacc_offices') THEN
  RAISE EXCEPTION 'R101_REFUSE_NONEMPTY_DATABASE';
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',TRUE),'')::uuid;
$$;
CREATE TABLE public.taxacc_offices (
 id uuid PRIMARY KEY,office_code text NOT NULL UNIQUE,is_demo boolean NOT NULL,is_active boolean NOT NULL,production_guard boolean NOT NULL
);
CREATE TABLE public.taxacc_staff (
 id uuid PRIMARY KEY,office_id uuid NOT NULL REFERENCES public.taxacc_offices(id),staff_code text NOT NULL,
 auth_user_id uuid,is_active boolean NOT NULL,can_review_documents boolean NOT NULL,role text NOT NULL,
 UNIQUE(office_id,id)
);
CREATE TABLE public.taxacc_clients (
 id uuid PRIMARY KEY,office_id uuid NOT NULL REFERENCES public.taxacc_offices(id),status text NOT NULL,is_demo boolean NOT NULL,
 UNIQUE(office_id,id)
);
CREATE TABLE public.taxacc_document_request_templates (
 office_id uuid NOT NULL REFERENCES public.taxacc_offices(id),template_code text NOT NULL,template_name text,
 case_type text NOT NULL,title text NOT NULL,public_message text,items jsonb NOT NULL,
 is_active boolean NOT NULL,PRIMARY KEY(office_id,template_code)
);
CREATE TABLE public.taxacc_r9_monthly_review_batches (
 id uuid PRIMARY KEY,office_id uuid NOT NULL REFERENCES public.taxacc_offices(id),state text NOT NULL,
 submitted_by uuid,reviewed_by uuid,reviewed_at timestamptz,
 target_period_label text NOT NULL,template_code text NOT NULL,
 UNIQUE(office_id,id), FOREIGN KEY(office_id,submitted_by) REFERENCES public.taxacc_staff(office_id,id),
 FOREIGN KEY(office_id,reviewed_by) REFERENCES public.taxacc_staff(office_id,id)
);
CREATE TABLE public.taxacc_r9_monthly_review_items (
 id uuid PRIMARY KEY,office_id uuid NOT NULL REFERENCES public.taxacc_offices(id),batch_id uuid NOT NULL,
 client_id uuid NOT NULL,template_code text NOT NULL,target_period_label text NOT NULL,item_state text NOT NULL,
 FOREIGN KEY(office_id,batch_id) REFERENCES public.taxacc_r9_monthly_review_batches(office_id,id),
 FOREIGN KEY(office_id,client_id) REFERENCES public.taxacc_clients(office_id,id)
);
CREATE TABLE public.taxacc_document_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,client_id uuid NOT NULL,
 request_code text NOT NULL,title text NOT NULL,request_category text NOT NULL,target_period_label text,
 requested_on date NOT NULL,due_on date,status text NOT NULL,public_message text,internal_notes text,
 requested_by uuid,requested_at timestamptz,is_visible_to_client boolean NOT NULL DEFAULT true,is_demo boolean NOT NULL DEFAULT true,
 UNIQUE(office_id,id),UNIQUE(office_id,request_code),
 FOREIGN KEY(office_id,client_id) REFERENCES public.taxacc_clients(office_id,id),
 FOREIGN KEY(office_id,requested_by) REFERENCES public.taxacc_staff(office_id,id)
);
CREATE TABLE public.taxacc_document_request_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,
 item_code text NOT NULL,item_name text NOT NULL,is_required boolean NOT NULL,sort_order int NOT NULL,status text NOT NULL,
 UNIQUE(office_id,request_id,item_code),
 FOREIGN KEY(office_id,request_id) REFERENCES public.taxacc_document_requests(office_id,id)
);
-- Synthetic office, reviewer and submitter.
INSERT INTO public.taxacc_offices VALUES
 ('11111111-1111-4111-8111-111111111111','dpro_taxacc_demo',true,true,true);
INSERT INTO public.taxacc_staff VALUES
 ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','TAX-ST-001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,true,'reviewer'),
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','TAX-ST-002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true,'submitter');
INSERT INTO public.taxacc_clients VALUES
 ('c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','active',true),
 ('c0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','active',true),
 ('c0000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','active',true),
 ('c0000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','active',true);
INSERT INTO public.taxacc_document_request_templates
 (office_id,template_code,template_name,case_type,title,public_message,items,is_active)
VALUES('11111111-1111-4111-8111-111111111111','MONTHLY-BASIC','Synthetic monthly basic',
 'monthly_documents','月次資料のご提出','Synthetic data only. Never send actual client information.',
 '[{"code":"BANK","name":"預金明細","required":true},{"code":"SALES","name":"売上資料","required":true},{"code":"PURCHASES","name":"仕入資料","required":true},{"code":"RECEIPTS","name":"領収書・レシート","required":true},{"code":"OTHER","name":"その他資料","required":false}]'::jsonb,true);
INSERT INTO public.taxacc_r9_monthly_review_batches VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','approved',
  '33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',now(),
  '2026-11','MONTHLY-BASIC');
INSERT INTO public.taxacc_r9_monthly_review_items (id,office_id,batch_id,client_id,template_code,target_period_label,item_state)
SELECT gen_random_uuid(),'11111111-1111-4111-8111-111111111111',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',c.id,'MONTHLY-BASIC','2026-11','candidate'
FROM public.taxacc_clients c;
-- Preserve previous monthly (different month), and one closing (category conversion test).
INSERT INTO public.taxacc_document_requests
 (office_id,client_id,request_code,title,request_category,target_period_label,requested_on,status,is_visible_to_client,is_demo)
VALUES
 ('11111111-1111-4111-8111-111111111111','c0000000-0000-4000-8000-000000000001',
  'LEGACY-202607','Old monthly','monthly','2026年07月','2026-07-01','partial',true,true),
 ('11111111-1111-4111-8111-111111111111','c0000000-0000-4000-8000-000000000002',
  'LEGACY-CLOSING','Old closing','closing','決算期','2026-07-01','partial',true,true);
