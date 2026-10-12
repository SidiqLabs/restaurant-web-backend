CREATE TABLE "order_staff" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" integer NOT NULL,
	"staff_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_staff" (
	"restaurant_id" integer NOT NULL,
	"staff_id" uuid NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_staff_restaurant_id_staff_id_pk" PRIMARY KEY("restaurant_id","staff_id"),
	CONSTRAINT "restaurant_staff_status" CHECK ("restaurant_staff"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "order_staff" ADD CONSTRAINT "order_staff_order_restaurant_fk" FOREIGN KEY ("order_id","restaurant_id") REFERENCES "public"."orders"("id","restaurant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_staff" ADD CONSTRAINT "order_staff_membership_fk" FOREIGN KEY ("restaurant_id","staff_id") REFERENCES "public"."restaurant_staff"("restaurant_id","staff_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;