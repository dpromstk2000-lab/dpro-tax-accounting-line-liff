-- DPRO TAX R10.1 / OFFLINE REVIEW CANDIDATE / 2026-10-11
-- NOT DEPLOYED. Explicitly BLOCKED until isolated real PostgreSQL testing.
-- Intended for shared Supabase: must be validated in BEGIN ... ROLLBACK before migration.
-- Never enables LINE, client visibility or full production batch dispatch.
-- Does not alter other office rows; demo office only. Existing document requests remain intact.
CREATE SCHEMA IF NOT EXISTS dpro_tax_r10_internal;
REVOKE ALL ON SCHEMA dpro_tax_r10_internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA dpro_tax_r10_internal TO authenticated;

-- A nullable approval link keeps historical manual requests compatible.
ALTER TABLE public.taxacc_document_requests
  ADD COLUMN IF NOT EXISTS r10_approval_batch_id uuid;
ALTER TABLE public.taxacc_document_requests
  ADD CONSTRAINT taxacc_r10_document_requests_batch_fk
  FOREIGN KEY (office_id,r10_approval_batch_id)
  REFERENCES public.taxacc_r9_monthly_review_batches (office_id,id);
-- Second-line integrity even if a link is missing: a client cannot have two R10
-- requests for the same approved batch. Nullable historical manual records are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS taxacc_r101_one_request_per_approved_client
 ON public.taxacc_document_requests (office_id,r10_approval_batch_id,client_id)
 WHERE r10_approval_batch_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.taxacc_r10_finalization_jobs (
  office_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  finalized_by uuid NOT NULL,
  due_on date NOT NULL,
  request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND 25),
  no_client_visibility boolean NOT NULL DEFAULT true CHECK (no_client_visibility),
  no_line_dispatch boolean NOT NULL DEFAULT true CHECK (no_line_dispatch),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(office_id,batch_id),
  FOREIGN KEY(office_id,batch_id) REFERENCES public.taxacc_r9_monthly_review_batches(office_id,id),
  FOREIGN KEY(office_id,finalized_by) REFERENCES public.taxacc_staff(office_id,id)
);
CREATE TABLE IF NOT EXISTS public.taxacc_r10_finalization_links (
  office_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  client_id uuid NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id,batch_id,client_id),
  UNIQUE (office_id,request_id),
  FOREIGN KEY (office_id,batch_id) REFERENCES public.taxacc_r10_finalization_jobs(office_id,batch_id),
  FOREIGN KEY (office_id,client_id) REFERENCES public.taxacc_clients(office_id,id),
  FOREIGN KEY (office_id,request_id) REFERENCES public.taxacc_document_requests(office_id,id)
);
ALTER TABLE public.taxacc_r10_finalization_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxacc_r10_finalization_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taxacc_r10_finalization_jobs,public.taxacc_r10_finalization_links FROM PUBLIC,anon,authenticated;

-- Fail closed on newly INSERTed monthly demo requests, even via legacy admin API/service_role.
-- Historical requests (including Japanese period notation) remain untouched.
CREATE OR REPLACE FUNCTION public.taxacc_r10_guard_monthly_document_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guard$
DECLARE v_uid uuid:=auth.uid();v_valid boolean;
BEGIN
  -- Prevent a forged R10 link on a nonmonthly request or another office.
  IF NEW.r10_approval_batch_id IS NOT NULL AND NEW.request_category IS DISTINCT FROM 'monthly' THEN
    RAISE EXCEPTION 'R101_APPROVAL_LINK_REQUIRES_MONTHLY_CATEGORY' USING ERRCODE='42501';
  END IF;
  IF NEW.request_category <> 'monthly' OR NOT EXISTS(
    SELECT 1 FROM public.taxacc_offices o
    WHERE o.id=NEW.office_id AND o.office_code='dpro_taxacc_demo' AND o.is_demo
  ) THEN RETURN NEW; END IF;
  IF NEW.r10_approval_batch_id IS NULL OR v_uid IS NULL
    OR NEW.target_period_label !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    OR NEW.status <> 'not_notified' OR NEW.is_visible_to_client IS DISTINCT FROM FALSE
    OR NEW.is_demo IS DISTINCT FROM TRUE OR NEW.requested_at IS NOT NULL
    OR NEW.due_on IS NULL OR NEW.due_on < NEW.requested_on THEN
     RAISE EXCEPTION 'R10_MONTHLY_REQUIRES_AUTHENTICATED_APPROVED_PRIVATE_BATCH'
       USING ERRCODE='42501';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.taxacc_r9_monthly_review_batches b
    JOIN public.taxacc_offices o ON o.id=b.office_id
    JOIN public.taxacc_staff s ON s.office_id=b.office_id AND s.id=b.reviewed_by
    JOIN public.taxacc_r9_monthly_review_items i
      ON i.office_id=b.office_id AND i.batch_id=b.id AND i.client_id=NEW.client_id
    JOIN public.taxacc_document_request_templates t
      ON t.office_id=b.office_id AND t.template_code=b.template_code
    WHERE b.id=NEW.r10_approval_batch_id AND b.office_id=NEW.office_id
      AND b.state='approved' AND b.submitted_by<>b.reviewed_by AND b.reviewed_at IS NOT NULL
      AND o.office_code='dpro_taxacc_demo' AND o.production_guard AND o.is_active AND o.is_demo
      AND s.is_active AND s.can_review_documents AND s.auth_user_id=v_uid
      AND s.role IN('owner','manager','reviewer')
      AND t.is_active AND t.case_type IN ('monthly','monthly_documents')
      AND i.item_state='candidate' AND i.template_code=b.template_code
      AND i.target_period_label=b.target_period_label
      AND NEW.target_period_label=b.target_period_label
      AND NEW.requested_by=s.id AND NEW.title=t.title
      AND NEW.request_code=('MR-'||replace(b.target_period_label,'-','')||'-'||
       upper(left(md5(b.office_id::text||'|'||NEW.client_id::text||'|'||b.template_code),18)))
  ) INTO v_valid;
  IF NOT v_valid THEN RAISE EXCEPTION 'R10_MONTHLY_APPROVAL_MISMATCH'
    USING ERRCODE='42501';END IF;
  RETURN NEW;
END;$guard$;
REVOKE ALL ON FUNCTION public.taxacc_r10_guard_monthly_document_insert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS taxacc_r10_approved_monthly_insert_gate ON public.taxacc_document_requests;
CREATE TRIGGER taxacc_r10_approved_monthly_insert_gate
  BEFORE INSERT ON public.taxacc_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.taxacc_r10_guard_monthly_document_insert();

-- Freeze R10-created requests until a separately audited R11 release gate exists.
-- This also blocks the legacy admin PATCH/DELETE routes from exposing them.
-- Existing monthly demo rows are preserved, but their category cannot be
-- swapped after creation, and a non-monthly request cannot be converted into a
-- monthly one through a legacy PATCH handler.
CREATE OR REPLACE FUNCTION public.taxacc_r10_protect_pre_dispatch_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $freeze$
BEGIN
  IF OLD.r10_approval_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'R10_APPROVED_REQUEST_FROZEN_NO_RELEASE_GATE'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.r10_approval_batch_id IS DISTINCT FROM OLD.r10_approval_batch_id THEN
    RAISE EXCEPTION 'R101_CANNOT_REASSIGN_APPROVAL_LINK' USING ERRCODE='42501';
  END IF;
  IF NEW.request_category IS DISTINCT FROM OLD.request_category
     AND ('monthly' IN (OLD.request_category,NEW.request_category))
     AND EXISTS (SELECT 1 FROM public.taxacc_offices o
                 WHERE o.id=OLD.office_id AND o.office_code='dpro_taxacc_demo' AND o.is_demo) THEN
    RAISE EXCEPTION 'R101_LEGACY_MONTHLY_CATEGORY_CONVERSION_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;$freeze$;
REVOKE ALL ON FUNCTION public.taxacc_r10_protect_pre_dispatch_request() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS taxacc_r10_pre_dispatch_request_freeze ON public.taxacc_document_requests;
CREATE TRIGGER taxacc_r10_pre_dispatch_request_freeze
 BEFORE UPDATE OR DELETE ON public.taxacc_document_requests
 FOR EACH ROW EXECUTE FUNCTION public.taxacc_r10_protect_pre_dispatch_request();

-- Child items are mutable through legacy document-item APIs. Freeze the children
-- after their R10 link is written. R10 itself inserts items *before* their link,
-- so the initial batch transaction remains valid and atomic.
CREATE OR REPLACE FUNCTION public.taxacc_r101_freeze_finalized_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $items$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF EXISTS(SELECT 1 FROM public.taxacc_r10_finalization_links l
              WHERE l.office_id=OLD.office_id AND l.request_id=OLD.request_id) THEN
      RAISE EXCEPTION 'R101_FINALIZED_ITEMS_IMMUTABLE' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF EXISTS(SELECT 1 FROM public.taxacc_r10_finalization_links l
              WHERE l.office_id=NEW.office_id AND l.request_id=NEW.request_id) THEN
      RAISE EXCEPTION 'R101_FINALIZED_ITEMS_IMMUTABLE' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;$items$;
REVOKE ALL ON FUNCTION public.taxacc_r101_freeze_finalized_items() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS taxacc_r101_finalized_items_freeze ON public.taxacc_document_request_items;
CREATE TRIGGER taxacc_r101_finalized_items_freeze
 BEFORE INSERT OR UPDATE OR DELETE ON public.taxacc_document_request_items
 FOR EACH ROW EXECUTE FUNCTION public.taxacc_r101_freeze_finalized_items();

-- For the R10 launch this is ONLY a protected demo-account mutation.
-- One transaction: batch lock, advisory serialisation, guard, insert rows, register links+job.
CREATE OR REPLACE FUNCTION dpro_tax_r10_internal.finalize_approved_demo(
 p_batch_id uuid,p_due_on date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $final$
DECLARE
 v_uid uuid:=auth.uid(); v_batch public.taxacc_r9_monthly_review_batches%ROWTYPE;
 v_template public.taxacc_document_request_templates%ROWTYPE;
 v_staff_id uuid;v_count int;v_duplicates int;v_invalid int;
 v_today date:=(now() AT TIME ZONE 'Asia/Tokyo')::date;
 v_existing public.taxacc_r10_finalization_jobs%ROWTYPE;
 v_item record;v_request_id uuid;v_code text;v_item_spec jsonb;v_item_code text;
 v_num int;v_total int:=0;
BEGIN
 IF v_uid IS NULL OR p_batch_id IS NULL THEN
   RAISE EXCEPTION 'R10_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_due_on IS NULL OR p_due_on<v_today OR p_due_on>v_today+120 THEN
   RAISE EXCEPTION 'R10_DUE_DATE_INVALID' USING ERRCODE='22023';END IF;
 SELECT b.* INTO v_batch FROM public.taxacc_r9_monthly_review_batches b
 WHERE b.id=p_batch_id FOR UPDATE;
 IF NOT FOUND OR v_batch.state<>'approved' OR v_batch.reviewed_at IS NULL
 OR v_batch.reviewed_by IS NULL OR v_batch.submitted_by=v_batch.reviewed_by THEN
   RAISE EXCEPTION 'R10_APPROVED_BATCH_REQUIRED' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.taxacc_offices o WHERE o.id=v_batch.office_id
 AND o.office_code='dpro_taxacc_demo' AND o.is_demo AND o.is_active AND o.production_guard) THEN
   RAISE EXCEPTION 'R10_DEMO_ONLY' USING ERRCODE='42501';END IF;
 SELECT s.id INTO v_staff_id FROM public.taxacc_staff s
 WHERE s.office_id=v_batch.office_id AND s.id=v_batch.reviewed_by
 AND s.auth_user_id=v_uid AND s.is_active AND s.can_review_documents
 AND s.role IN('owner','manager','reviewer');
 IF v_staff_id IS NULL THEN RAISE EXCEPTION 'R10_APPROVER_IDENTITY_REQUIRED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('DPRO_TAX_R10|'||v_batch.office_id::text||'|'||v_batch.template_code||'|'||v_batch.target_period_label,0));
 SELECT j.* INTO v_existing FROM public.taxacc_r10_finalization_jobs j
 WHERE j.office_id=v_batch.office_id AND j.batch_id=v_batch.id;
 IF FOUND THEN
   IF v_existing.due_on<>p_due_on THEN RAISE EXCEPTION 'R10_ALREADY_FINALIZED_OTHER_DUE_DATE' USING ERRCODE='23505';END IF;
   SELECT count(*) INTO v_total FROM public.taxacc_r10_finalization_links l
   JOIN public.taxacc_document_requests r ON r.office_id=l.office_id AND r.id=l.request_id
   WHERE l.office_id=v_batch.office_id AND l.batch_id=v_batch.id
     AND r.r10_approval_batch_id=v_batch.id AND r.status='not_notified'
     AND r.is_visible_to_client IS FALSE AND r.is_demo IS TRUE AND r.requested_at IS NULL;
   IF v_total<>v_existing.request_count OR
      (SELECT count(*) FROM public.taxacc_document_requests r
       WHERE r.office_id=v_batch.office_id AND r.r10_approval_batch_id=v_batch.id)<>v_existing.request_count
      OR EXISTS(SELECT 1 FROM public.taxacc_r10_finalization_links l
                WHERE l.office_id=v_batch.office_id AND l.batch_id=v_batch.id
                AND NOT EXISTS(SELECT 1 FROM public.taxacc_document_request_items i
                  WHERE i.office_id=l.office_id AND i.request_id=l.request_id)) THEN
     RAISE EXCEPTION 'R101_FINALIZATION_LEDGER_INCONSISTENT' USING ERRCODE='23514';
   END IF;
   RETURN jsonb_build_object('ok',true,'already_finalized',true,'request_count',v_existing.request_count,
    'state','not_notified','client_visible',false,'line_dispatched',false,'batch_id',v_batch.id);
 END IF;
 SELECT t.* INTO v_template FROM public.taxacc_document_request_templates t
 WHERE t.office_id=v_batch.office_id AND t.template_code=v_batch.template_code
 AND t.is_active AND t.case_type IN('monthly','monthly_documents');
 IF NOT FOUND OR jsonb_typeof(v_template.items)<>'array'
   OR jsonb_array_length(v_template.items) NOT BETWEEN 1 AND 40 THEN
   RAISE EXCEPTION 'R10_ACTIVE_MONTHLY_TEMPLATE_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT count(*),count(*) FILTER(WHERE i.item_state<>'candidate') INTO v_count,v_invalid
 FROM public.taxacc_r9_monthly_review_items i
 WHERE i.office_id=v_batch.office_id AND i.batch_id=v_batch.id;
 IF v_count NOT BETWEEN 1 AND 25 OR v_invalid>0 THEN
   RAISE EXCEPTION 'R10_INVALID_BATCH_ITEMS' USING ERRCODE='23514';END IF;
 SELECT count(*) INTO v_invalid FROM public.taxacc_r9_monthly_review_items i
 LEFT JOIN public.taxacc_clients c ON c.office_id=i.office_id AND c.id=i.client_id
 WHERE i.office_id=v_batch.office_id AND i.batch_id=v_batch.id AND
 (c.id IS NULL OR c.status<>'active' OR c.is_demo IS DISTINCT FROM TRUE
   OR i.target_period_label<>v_batch.target_period_label OR i.template_code<>v_batch.template_code);
 IF v_invalid>0 THEN RAISE EXCEPTION 'R10_CLIENT_OR_ITEM_INVALID' USING ERRCODE='23514';END IF;
 -- Block existing legacy requests by category/period, including YYYY年MM月 aliases.
 SELECT count(*) INTO v_duplicates FROM public.taxacc_r9_monthly_review_items i
 JOIN public.taxacc_document_requests r ON r.office_id=i.office_id AND r.client_id=i.client_id
 WHERE i.office_id=v_batch.office_id AND i.batch_id=v_batch.id
 AND r.request_category='monthly' AND r.status<>'not_required'
 AND (r.target_period_label IS NULL OR btrim(r.target_period_label)=''
   OR r.target_period_label IN(
      v_batch.target_period_label,
      to_char((v_batch.target_period_label||'-01')::date,'YYYY"年"MM"月"'),
      to_char((v_batch.target_period_label||'-01')::date,'YYYY"年"FMMM"月"'),
      to_char((v_batch.target_period_label||'-01')::date,'YYYY/MM'),
      to_char((v_batch.target_period_label||'-01')::date,'YYYY/FMMM'),
      to_char((v_batch.target_period_label||'-01')::date,'YYYY-FMMM')
   ));
 IF v_duplicates>0 THEN RAISE EXCEPTION 'R10_DUPLICATE_EXISTING_MONTHLY_REQUEST' USING ERRCODE='23505';END IF;
 -- A job is durable only if every request/item/link is successfully inserted in this transaction.
 INSERT INTO public.taxacc_r10_finalization_jobs(office_id,batch_id,finalized_by,due_on,request_count)
 VALUES(v_batch.office_id,v_batch.id,v_staff_id,p_due_on,v_count);
 FOR v_item IN SELECT i.client_id FROM public.taxacc_r9_monthly_review_items i
  WHERE i.office_id=v_batch.office_id AND i.batch_id=v_batch.id ORDER BY i.client_id LOOP
   v_code:='MR-'||replace(v_batch.target_period_label,'-','')||'-'||
     upper(left(md5(v_batch.office_id::text||'|'||v_item.client_id::text||'|'||v_batch.template_code),18));
   INSERT INTO public.taxacc_document_requests (
    office_id,client_id,request_code,title,request_category,target_period_label,requested_on,due_on,
    status,public_message,internal_notes,requested_by,requested_at,is_visible_to_client,is_demo,r10_approval_batch_id)
   VALUES(v_batch.office_id,v_item.client_id,v_code,v_template.title,'monthly',
    v_batch.target_period_label,v_today,p_due_on,'not_notified',v_template.public_message,
    'R10 デモ承認済み資料依頼：非公開、LINE未送信',v_staff_id,NULL,FALSE,TRUE,v_batch.id)
   RETURNING id INTO v_request_id;
   v_num:=0;
   FOR v_item_spec IN SELECT value FROM jsonb_array_elements(v_template.items) LOOP
     v_num:=v_num+1;
     v_item_code:=upper(btrim(coalesce(v_item_spec->>'code','')));
     IF v_item_code !~ '^[A-Z0-9_-]{1,60}$' OR length(coalesce(v_item_spec->>'name','')) NOT BETWEEN 1 AND 200 THEN
       RAISE EXCEPTION 'R10_TEMPLATE_ITEM_INVALID' USING ERRCODE='23514';END IF;
     INSERT INTO public.taxacc_document_request_items (
       office_id,request_id,item_code,item_name,is_required,sort_order,status)
     VALUES(v_batch.office_id,v_request_id,v_item_code,v_item_spec->>'name',
       coalesce((v_item_spec->>'required')::boolean,true),v_num,'missing');
   END LOOP;
   INSERT INTO public.taxacc_r10_finalization_links(office_id,batch_id,client_id,request_id)
   VALUES(v_batch.office_id,v_batch.id,v_item.client_id,v_request_id);
   v_total:=v_total+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'already_finalized',false,'request_count',v_total,
 'state','not_notified','client_visible',false,'line_dispatched',false,'batch_id',v_batch.id);
END;$final$;
REVOKE ALL ON FUNCTION dpro_tax_r10_internal.finalize_approved_demo(uuid,date) FROM PUBLIC,anon,authenticated;
-- Permission remains disabled on the privileged implementation until QA gate passes.
CREATE OR REPLACE FUNCTION public.taxacc_r10_finalize_approved_demo(p_batch_id uuid,p_due_on date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $wrapper$
 SELECT dpro_tax_r10_internal.finalize_approved_demo(p_batch_id,p_due_on);
$wrapper$;
REVOKE ALL ON FUNCTION public.taxacc_r10_finalize_approved_demo(uuid,date) FROM PUBLIC,anon,authenticated;
-- R10 release disabled until deployment QA: no GRANT EXECUTE on public wrapper to authenticated.
