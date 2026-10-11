CREATE TABLE "order_checkouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"restaurant_name" varchar(100) NOT NULL,
	"delivery_address" varchar(500) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"notes" varchar(1000) DEFAULT '' NOT NULL,
	"item_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_checkouts_key_valid" CHECK ("order_checkouts"."idempotency_key" ~ '^[A-Za-z0-9_-]{16,128}$'),
	CONSTRAINT "order_checkouts_hash_valid" CHECK ("order_checkouts"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_checkouts_address_bounds" CHECK (length(btrim("order_checkouts"."delivery_address")) BETWEEN 10 AND 500),
	CONSTRAINT "order_checkouts_phone_valid" CHECK ("order_checkouts"."phone" ~ '^[+0-9() -]{8,30}$' AND "order_checkouts"."phone" ~ '[0-9]'),
	CONSTRAINT "order_checkouts_payment_method" CHECK ("order_checkouts"."payment_method" IN ('BNI Bank Negara Indonesia','BRI Bank Rakyat Indonesia','BCA Bank Central Asia','Mandiri')),
	CONSTRAINT "order_checkouts_item_count" CHECK ("order_checkouts"."item_count" BETWEEN 1 AND 50)
);

--> statement-breakpoint
ALTER TABLE "order_checkouts" ADD CONSTRAINT "order_checkouts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_checkouts" ADD CONSTRAINT "order_checkouts_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "order_checkouts_order_unique" ON "order_checkouts" USING btree ("order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "order_checkouts_customer_key_unique" ON "order_checkouts" USING btree ("customer_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "order_checkouts_customer_created_idx" ON "order_checkouts" USING btree ("customer_id","created_at");
--> statement-breakpoint
-- These checkout-specific triggers supplement Drizzle's declarative snapshot.
-- Existing foundation/payment orders without placement records are unchanged.
CREATE FUNCTION public.validate_checkout_placement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase public.orders%ROWTYPE; line_count bigint; sum_total bigint; valid_lines boolean;
BEGIN
  SELECT * INTO purchase FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF NOT FOUND OR purchase.customer_id <> NEW.customer_id OR purchase.status <> 'PENDING'
     OR EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'Invalid checkout placement' USING ERRCODE = '23514';
  END IF;
  SELECT count(*), coalesce(sum(line_total_rupiah::bigint),0),
    coalesce(bool_and(quantity BETWEEN 1 AND 99),false)
    INTO line_count, sum_total, valid_lines FROM public.order_items WHERE order_id = NEW.order_id;
  IF line_count <> NEW.item_count OR sum_total <> purchase.total_rupiah OR NOT valid_lines
     OR EXISTS (SELECT menu_id FROM public.order_items WHERE order_id = NEW.order_id GROUP BY menu_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Invalid checkout snapshots' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER checkout_placement_validate BEFORE INSERT ON public.order_checkouts
FOR EACH ROW EXECUTE FUNCTION public.validate_checkout_placement();
--> statement-breakpoint
CREATE FUNCTION public.reject_checkout_placement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Checkout placement is immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER checkout_placement_immutable BEFORE UPDATE OR DELETE ON public.order_checkouts
FOR EACH ROW EXECUTE FUNCTION public.reject_checkout_placement_mutation();
--> statement-breakpoint
CREATE FUNCTION public.protect_checkout_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_checkouts WHERE order_id = OLD.id)
     AND (NEW.id,NEW.customer_id,NEW.restaurant_id,NEW.total_rupiah,NEW.created_at)
       IS DISTINCT FROM (OLD.id,OLD.customer_id,OLD.restaurant_id,OLD.total_rupiah,OLD.created_at) THEN
    RAISE EXCEPTION 'Checkout purchase facts are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER checkout_order_facts_immutable BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.protect_checkout_order();
--> statement-breakpoint
CREATE FUNCTION public.protect_checkout_item_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize inserts against checkout finalization, including direct SQL writers.
  PERFORM id FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.order_checkouts WHERE order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'Checkout snapshots are finalized' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER checkout_items_finalized BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.protect_checkout_item_insert();
