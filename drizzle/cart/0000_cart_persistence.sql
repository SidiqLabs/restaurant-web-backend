CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"restaurant_id" integer NOT NULL,
	"menu_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"slot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_bounds" CHECK ("cart_items"."quantity" BETWEEN 1 AND 99),
	CONSTRAINT "cart_items_slot_bounds" CHECK ("cart_items"."slot" BETWEEN 1 AND 50)
);

--> statement-breakpoint
CREATE TABLE "carts" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" integer NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX "carts_customer_restaurant_unique" ON "carts" USING btree ("customer_id","restaurant_id");
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_restaurant_fk" FOREIGN KEY ("customer_id","restaurant_id") REFERENCES "public"."carts"("customer_id","restaurant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_menu_restaurant_fk" FOREIGN KEY ("menu_id","restaurant_id") REFERENCES "public"."menus"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_customer_menu_unique" ON "cart_items" USING btree ("customer_id","menu_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_customer_slot_unique" ON "cart_items" USING btree ("customer_id","slot");
--> statement-breakpoint
CREATE INDEX "cart_items_menu_restaurant_idx" ON "cart_items" USING btree ("menu_id","restaurant_id");
