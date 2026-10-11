CREATE TYPE "payment_status" AS ENUM ('PAID', 'REFUNDED');
--> statement-breakpoint
CREATE TABLE "order_payments" (
 "order_id" uuid PRIMARY KEY REFERENCES "orders"("id") ON DELETE RESTRICT,
 "status" payment_status DEFAULT 'PAID' NOT NULL,
 "reference" varchar(100) NOT NULL,
 "confirmed_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "confirmed_at" timestamptz DEFAULT now() NOT NULL,
 "refunded_by" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
 "refunded_at" timestamptz,
 CONSTRAINT "order_payments_refund_state" CHECK (
  (status = 'PAID' AND refunded_by IS NULL AND refunded_at IS NULL) OR
  (status = 'REFUNDED' AND refunded_by IS NOT NULL AND refunded_at IS NOT NULL AND refunded_at >= confirmed_at)
 )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_reference_unique" ON "order_payments" ("reference");
--> statement-breakpoint
CREATE FUNCTION protect_payment_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Payment evidence is immutable' USING ERRCODE = '23514'; END IF;
 IF TG_OP = 'INSERT' THEN
  PERFORM 1 FROM orders WHERE id = NEW.order_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.status <> 'CANCELLED' AND o.total_rupiah > 0 AND o.total_rupiah = (SELECT sum(line_total_rupiah) FROM order_items WHERE order_id = o.id)) THEN
   RAISE EXCEPTION 'Invalid purchase facts' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> 'PAID' OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.confirmed_by AND role = 'ADMIN') THEN
   RAISE EXCEPTION 'Invalid payment confirmation' USING ERRCODE = '23514';
  END IF;
 ELSE
  IF OLD.status <> 'PAID' OR NEW.status <> 'REFUNDED' OR
     (NEW.order_id, NEW.reference, NEW.confirmed_by, NEW.confirmed_at) IS DISTINCT FROM
     (OLD.order_id, OLD.reference, OLD.confirmed_by, OLD.confirmed_at) OR
     NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.refunded_by AND role = 'ADMIN') THEN
   RAISE EXCEPTION 'Invalid payment transition' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_payments_protect BEFORE INSERT OR UPDATE OR DELETE ON order_payments
FOR EACH ROW EXECUTE FUNCTION protect_payment_evidence();

--> statement-breakpoint
CREATE TABLE order_cancellations (
 order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 cancelled_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 cancelled_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TRIGGER order_cancellations_immutable BEFORE UPDATE OR DELETE ON order_cancellations
FOR EACH ROW EXECUTE FUNCTION reject_order_item_mutation();
--> statement-breakpoint
CREATE FUNCTION protect_paid_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'order_items' THEN
  PERFORM 1 FROM orders WHERE id = NEW.order_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM order_payments WHERE order_id = NEW.order_id) THEN
   RAISE EXCEPTION 'Paid purchase is immutable' USING ERRCODE = '23514';
  END IF;
 ELSE
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
   RAISE EXCEPTION 'Cancellation is terminal' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM order_payments WHERE order_id = OLD.id) AND
     (NEW.id, NEW.customer_id, NEW.restaurant_id, NEW.total_rupiah) IS DISTINCT FROM
     (OLD.id, OLD.customer_id, OLD.restaurant_id, OLD.total_rupiah) THEN
   RAISE EXCEPTION 'Paid purchase is immutable' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER paid_order_items_protect BEFORE INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION protect_paid_purchase();
--> statement-breakpoint
CREATE TRIGGER paid_orders_protect BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION protect_paid_purchase();
