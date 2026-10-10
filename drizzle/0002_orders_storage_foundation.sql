CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"restaurant_id" integer NOT NULL,
	"menu_id" integer NOT NULL,
	"menu_name" varchar(100) NOT NULL,
	"unit_price_rupiah" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_rupiah" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_name_nonblank" CHECK (length(btrim("order_items"."menu_name")) > 0),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_nonnegative" CHECK ("order_items"."unit_price_rupiah" >= 0),
	CONSTRAINT "order_items_total_nonnegative" CHECK ("order_items"."line_total_rupiah" >= 0),
	CONSTRAINT "order_items_total_matches" CHECK ("order_items"."line_total_rupiah"::bigint = "order_items"."unit_price_rupiah"::bigint * "order_items"."quantity"::bigint)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"restaurant_id" integer NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"total_rupiah" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_nonnegative" CHECK ("orders"."total_rupiah" >= 0),
	CONSTRAINT "orders_timestamps_ordered" CHECK ("orders"."updated_at" >= "orders"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_id_restaurant_unique" ON "orders" USING btree ("id","restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_id_restaurant_unique" ON "menus" USING btree ("id","restaurant_id");
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_restaurant_fk" FOREIGN KEY ("order_id","restaurant_id") REFERENCES "public"."orders"("id","restaurant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_restaurant_fk" FOREIGN KEY ("menu_id","restaurant_id") REFERENCES "public"."menus"("id","restaurant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "order_items_menu_idx" ON "order_items" USING btree ("menu_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "orders_customer_created_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_restaurant_status_created_idx" ON "orders" USING btree ("restaurant_id","status","created_at");--> statement-breakpoint
CREATE FUNCTION "public"."reject_order_item_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Order item snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "order_items_immutable"
BEFORE UPDATE OR DELETE ON "public"."order_items"
FOR EACH ROW EXECUTE FUNCTION "public"."reject_order_item_mutation"();
