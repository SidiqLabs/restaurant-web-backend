CREATE TABLE "review_menus" (
	"review_id" integer NOT NULL,
	"menu_id" integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"restaurant_id" integer NOT NULL,
	"order_id" uuid NOT NULL,
	"star" integer NOT NULL,
	"comment" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reviews_star_bounds" CHECK ("reviews"."star" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_comment_bounds" CHECK (length(btrim("reviews"."comment")) BETWEEN 1 AND 2000),
	CONSTRAINT "reviews_timestamps" CHECK ("reviews"."updated_at" >= "reviews"."created_at" AND ("reviews"."deleted_at" IS NULL OR "reviews"."deleted_at" >= "reviews"."created_at"))
);

--> statement-breakpoint
ALTER TABLE "review_menus" ADD CONSTRAINT "review_menus_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_restaurant_fk" FOREIGN KEY ("order_id","restaurant_id") REFERENCES "public"."orders"("id","restaurant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "review_menus_review_menu_unique" ON "review_menus" USING btree ("review_id","menu_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_unique" ON "reviews" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "reviews_restaurant_created_idx" ON "reviews" USING btree ("restaurant_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "reviews_customer_created_idx" ON "reviews" USING btree ("customer_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION validate_review_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM users WHERE id=NEW.customer_id AND role='CUSTOMER' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer required' USING ERRCODE='23514'; END IF;
  PERFORM o.id FROM orders o JOIN order_checkouts c ON c.order_id=o.id
    WHERE o.id=NEW.order_id AND o.customer_id=NEW.customer_id
      AND o.restaurant_id=NEW.restaurant_id AND o.status='COMPLETED' FOR SHARE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Completed owned checkout required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reviews_purchase_valid BEFORE INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION validate_review_purchase();
--> statement-breakpoint
CREATE FUNCTION protect_review_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Use review soft delete' USING ERRCODE='23514'; END IF;
  IF OLD.deleted_at IS NOT NULL OR
    (NEW.id,NEW.customer_id,NEW.restaurant_id,NEW.order_id,NEW.created_at) IS DISTINCT FROM
    (OLD.id,OLD.customer_id,OLD.restaurant_id,OLD.order_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Review identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reviews_identity_immutable BEFORE UPDATE OR DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION protect_review_identity();
--> statement-breakpoint
CREATE FUNCTION validate_review_menu() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase uuid; deleted timestamptz;
BEGIN
  SELECT order_id,deleted_at INTO purchase,deleted FROM reviews WHERE id=NEW.review_id FOR UPDATE;
  IF NOT FOUND OR deleted IS NOT NULL OR NOT EXISTS (SELECT 1 FROM order_items WHERE order_id=purchase AND menu_id=NEW.menu_id)
    OR (SELECT count(*) FROM review_menus WHERE review_id=NEW.review_id) >= 50 THEN
    RAISE EXCEPTION 'Invalid reviewed purchase menu' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER review_menus_valid BEFORE INSERT ON review_menus FOR EACH ROW EXECUTE FUNCTION validate_review_menu();
--> statement-breakpoint
CREATE TRIGGER review_menus_immutable BEFORE UPDATE OR DELETE ON review_menus FOR EACH ROW EXECUTE FUNCTION reject_order_item_mutation();
--> statement-breakpoint
CREATE FUNCTION review_requires_menus() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM review_menus WHERE review_id=NEW.id) THEN
    RAISE EXCEPTION 'Review requires purchased menus' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER reviews_require_menus AFTER INSERT ON reviews
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION review_requires_menus();
