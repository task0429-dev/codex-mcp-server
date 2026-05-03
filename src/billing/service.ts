import crypto from "crypto";
import {
  APP_BASE_URL,
  BILLING_CANCEL_URL,
  STRIPE_CATALOG_JSON,
  BILLING_PORTAL_RETURN_URL,
  BILLING_SUCCESS_URL,
  STRIPE_PRICE_ID_ENTERPRISE,
  STRIPE_PRICE_ID_PRO,
  STRIPE_PRICE_ID_STARTER,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} from "../config";
import { logger } from "../core/logger";
import { requestJson } from "../core/api-client";
import { ensureBillingSchema, getBillingPool, readBillingFileState, writeBillingFileState } from "./db";

type StripeObject = Record<string, any>;

export type BillingCatalogItem = {
  key: string;
  referenceId: string;
  priceId: string;
  productId: string | null;
  productName: string;
  amount: number | null;
  currency: string | null;
  interval: string | null;
  livemode: boolean;
  active: boolean;
};

export class BillingService {
  private static schemaReady: Promise<{ configured: boolean; ready: boolean; storageMode: "postgres" | "file" }> | null = null;

  private static requireStripeSecret(): string {
    if (!STRIPE_SECRET_KEY) {
      throw new Error("Stripe secret key not configured.");
    }
    return STRIPE_SECRET_KEY;
  }

  private static defaultSuccessUrl(): string {
    return BILLING_SUCCESS_URL || `${APP_BASE_URL || "http://127.0.0.1:3000"}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  }

  private static defaultCancelUrl(): string {
    return BILLING_CANCEL_URL || `${APP_BASE_URL || "http://127.0.0.1:3000"}/billing/cancel`;
  }

  private static defaultPortalReturnUrl(): string {
    return BILLING_PORTAL_RETURN_URL || APP_BASE_URL || "http://127.0.0.1:3000";
  }

  private static stripeHeaders(contentType = "application/x-www-form-urlencoded"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.requireStripeSecret()}`,
      "Content-Type": contentType,
    };
  }

  private static getConfiguredCatalogEntries(): Array<{ key: string; referenceId: string }> {
    if (STRIPE_CATALOG_JSON) {
      try {
        const parsed = JSON.parse(STRIPE_CATALOG_JSON) as Array<Record<string, unknown>>;
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => ({
              key: String(item.key || "").trim(),
              referenceId: String(item.referenceId || item.priceId || item.productId || "").trim(),
            }))
            .filter((item) => item.key && item.referenceId);
        }
      } catch (error) {
        logger.warn("billing_catalog_json_invalid", { error: (error as Error).message });
      }
    }

    return [
      { key: "starter", referenceId: STRIPE_PRICE_ID_STARTER || "" },
      { key: "pro", referenceId: STRIPE_PRICE_ID_PRO || "" },
      { key: "enterprise", referenceId: STRIPE_PRICE_ID_ENTERPRISE || "" },
    ].filter((item) => item.referenceId);
  }

  private static async resolvePriceReference(referenceId: string): Promise<{ referenceId: string; price: StripeObject; product: StripeObject | null }> {
    if (referenceId.startsWith("price_")) {
      const price = await requestJson<StripeObject>(`https://api.stripe.com/v1/prices/${referenceId}?expand[]=product`, {
        headers: this.stripeHeaders(),
      });
      return {
        referenceId,
        price,
        product: typeof price.product === "object" ? price.product : null,
      };
    }

    if (referenceId.startsWith("prod_")) {
      const product = await requestJson<StripeObject>(`https://api.stripe.com/v1/products/${referenceId}?expand[]=default_price`, {
        headers: this.stripeHeaders(),
      });

      const defaultPrice = typeof product.default_price === "object" ? product.default_price : null;
      if (!defaultPrice?.id) {
        throw new Error(`Stripe product ${referenceId} does not have a default price configured.`);
      }

      return {
        referenceId,
        price: defaultPrice,
        product,
      };
    }

    throw new Error(`Unsupported Stripe reference: ${referenceId}`);
  }

  private static encodeForm(values: Record<string, string | number | boolean | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === "") continue;
      params.append(key, String(value));
    }
    return params.toString();
  }

  private static asTimestamp(value?: number | null): string | null {
    if (!value) return null;
    return new Date(value * 1000).toISOString();
  }

  static async ensureReady(): Promise<{ configured: boolean; ready: boolean; storageMode: "postgres" | "file" }> {
    if (!this.schemaReady) {
      this.schemaReady = ensureBillingSchema().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }
    return this.schemaReady!;
  }

  static async getHealth() {
    const dbStatus = await this.ensureReady();
    return {
      stripeConfigured: Boolean(STRIPE_SECRET_KEY),
      webhookConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
      publishableKeyConfigured: Boolean(STRIPE_PUBLISHABLE_KEY),
      databaseConfigured: dbStatus.configured,
      databaseReady: dbStatus.ready,
      storageMode: dbStatus.storageMode,
      appBaseUrl: APP_BASE_URL || null,
      pricesConfigured: {
        starter: Boolean(STRIPE_PRICE_ID_STARTER),
        pro: Boolean(STRIPE_PRICE_ID_PRO),
        enterprise: Boolean(STRIPE_PRICE_ID_ENTERPRISE),
      },
    };
  }

  static async getCatalog(): Promise<{ publishableKey: string | null; plans: BillingCatalogItem[] }> {
    const configured = this.getConfiguredCatalogEntries();

    const plans = await Promise.all(
      configured.map(async (item) => {
        const resolved = await this.resolvePriceReference(item.referenceId);
        const price = resolved.price;
        const product = resolved.product;

        return {
          key: item.key,
          referenceId: item.referenceId,
          priceId: price.id,
          productId: product?.id || (typeof price.product === "string" ? price.product : null),
          productName: product?.name || item.key,
          amount: price.unit_amount ?? null,
          currency: price.currency ?? null,
          interval: price.recurring?.interval ?? null,
          livemode: Boolean(price.livemode),
          active: Boolean(price.active),
        } satisfies BillingCatalogItem;
      })
    );

    return {
      publishableKey: STRIPE_PUBLISHABLE_KEY || null,
      plans,
    };
  }

  static async createCheckoutSession(input: {
    priceId?: string;
    referenceId?: string;
    email: string;
    successUrl?: string;
    cancelUrl?: string;
    customerId?: string;
    metadata?: Record<string, string>;
  }) {
    await this.ensureReady();
    const resolved = await this.resolvePriceReference(input.priceId || input.referenceId || "");
    const checkoutMode = resolved.price.recurring ? "subscription" : "payment";

    const payload: Record<string, string | number | boolean | undefined> = {
      mode: checkoutMode,
      success_url: input.successUrl || this.defaultSuccessUrl(),
      cancel_url: input.cancelUrl || this.defaultCancelUrl(),
      customer: input.customerId,
      customer_email: input.customerId ? undefined : input.email,
      "line_items[0][price]": resolved.price.id,
      "line_items[0][quantity]": 1,
      "allow_promotion_codes": true,
      "billing_address_collection": "auto",
      "payment_method_types[0]": "card",
      "metadata[reference_id]": resolved.referenceId,
      "metadata[price_id]": resolved.price.id,
    };

    if (checkoutMode === "subscription") {
      payload["subscription_data[metadata][customer_email]"] = input.email;
      payload["subscription_data[metadata][reference_id]"] = resolved.referenceId;
      payload["subscription_data[metadata][price_id]"] = resolved.price.id;
    }

    for (const [key, value] of Object.entries(input.metadata || {})) {
      payload[`metadata[${key}]`] = value;
      if (checkoutMode === "subscription") {
        payload[`subscription_data[metadata][${key}]`] = value;
      }
    }

    const session = await requestJson<StripeObject>("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: this.stripeHeaders(),
      body: this.encodeForm(payload),
    });

    await this.storeCheckoutSession(session);

    return {
      id: session.id,
      url: session.url,
      customerId: session.customer || null,
      status: session.status || null,
      paymentStatus: session.payment_status || null,
    };
  }

  static async createPortalSession(input: { customerId: string; returnUrl?: string }) {
    const portal = await requestJson<StripeObject>("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: this.stripeHeaders(),
      body: this.encodeForm({
        customer: input.customerId,
        return_url: input.returnUrl || this.defaultPortalReturnUrl(),
      }),
    });

    return {
      id: portal.id,
      url: portal.url,
    };
  }

  static async getCustomerBillingState(input: { customerId?: string; email?: string }) {
    await this.ensureReady();

    const db = getBillingPool();
    if (!db) {
      return this.getCustomerBillingStateFromStripe(input);
    }

    let customerRow: any | null = null;
    if (input.customerId) {
      customerRow = (await db.query(
        `select * from billing_customers where stripe_customer_id = $1 limit 1`,
        [input.customerId]
      )).rows[0] || null;
    } else if (input.email) {
      customerRow = (await db.query(
        `select * from billing_customers where lower(email) = lower($1) order by updated_at desc limit 1`,
        [input.email]
      )).rows[0] || null;
    }

    if (!customerRow) {
      return { customer: null, subscriptions: [], checkoutSessions: [] };
    }

    const subscriptions = (await db.query(
      `select * from billing_subscriptions where stripe_customer_id = $1 order by updated_at desc`,
      [customerRow.stripe_customer_id]
    )).rows;

    const checkoutSessions = (await db.query(
      `select * from billing_checkout_sessions where stripe_customer_id = $1 order by updated_at desc limit 10`,
      [customerRow.stripe_customer_id]
    )).rows;

    return {
      customer: customerRow,
      subscriptions,
      checkoutSessions,
    };
  }

  static verifyWebhookSignature(rawBody: Buffer, signatureHeader?: string | string[]) {
    if (!STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhook secret is not configured.");
    }
    if (!signatureHeader || Array.isArray(signatureHeader)) {
      throw new Error("Missing Stripe signature header.");
    }

    const parts = signatureHeader.split(",").map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
    const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);

    if (!timestamp || !signature) {
      throw new Error("Invalid Stripe signature header.");
    }

    const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
    const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(signature, "hex");
    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      throw new Error("Stripe signature verification failed.");
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
      throw new Error("Stripe signature timestamp is outside the allowed window.");
    }
  }

  static async processWebhookEvent(rawBody: Buffer, signatureHeader?: string | string[]) {
    this.verifyWebhookSignature(rawBody, signatureHeader);
    await this.ensureReady();

    const event = JSON.parse(rawBody.toString("utf8")) as StripeObject;
    const db = getBillingPool();
    if (!db) {
      const state = await readBillingFileState();
      if (state.events[event.id]) {
        return { ok: true, duplicate: true, eventId: event.id };
      }
      state.events[event.id] = {
        stripe_event_id: event.id,
        event_type: event.type,
        object_id: event.data?.object?.id || null,
        livemode: Boolean(event.livemode),
        created_ts: event.created || null,
        payload: event,
        processed_at: new Date().toISOString(),
      };
      await writeBillingFileState(state);

      const object = event.data?.object || {};
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
        case "checkout.session.expired":
          await this.storeCheckoutSession(object);
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await this.storeSubscription(object);
          break;
        case "customer.created":
        case "customer.updated":
          await this.storeCustomer(object);
          break;
      }

      return { ok: true, duplicate: false, eventId: event.id, eventType: event.type };
    }

    const alreadySeen = await db.query(
      `select stripe_event_id from billing_events where stripe_event_id = $1 limit 1`,
      [event.id]
    );
    if (alreadySeen.rows.length > 0) {
      return { ok: true, duplicate: true, eventId: event.id };
    }

    const object = event.data?.object || {};
    await db.query(
      `insert into billing_events (stripe_event_id, event_type, object_id, livemode, created_ts, payload)
       values ($1, $2, $3, $4, to_timestamp($5), $6::jsonb)`,
      [event.id, event.type, object.id || null, Boolean(event.livemode), event.created || null, JSON.stringify(event)]
    );

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.expired":
        await this.storeCheckoutSession(object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.storeSubscription(object);
        break;
      case "customer.created":
      case "customer.updated":
        await this.storeCustomer(object);
        break;
      case "invoice.paid":
      case "invoice.payment_failed":
        if (object.subscription) {
          await this.refreshSubscription(String(object.subscription));
        }
        if (object.customer) {
          await this.refreshCustomer(String(object.customer));
        }
        break;
      default:
        logger.info("billing_webhook_ignored", { eventType: event.type });
        break;
    }

    return { ok: true, duplicate: false, eventId: event.id, eventType: event.type };
  }

  static async refreshSubscription(subscriptionId: string) {
    const subscription = await requestJson<StripeObject>(
      `https://api.stripe.com/v1/subscriptions/${subscriptionId}?expand[]=items.data.price`,
      { headers: this.stripeHeaders() }
    );
    await this.storeSubscription(subscription);
    return subscription;
  }

  static async refreshCustomer(customerId: string) {
    const customer = await requestJson<StripeObject>(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: this.stripeHeaders(),
    });
    await this.storeCustomer(customer);
    return customer;
  }

  private static async storeCustomer(customer: StripeObject) {
    const db = getBillingPool();
    if (!customer?.id) return;

    if (!db) {
      const state = await readBillingFileState();
      state.customers[customer.id] = {
        stripe_customer_id: customer.id,
        email: customer.email || null,
        name: customer.name || null,
        metadata: customer.metadata || {},
        payload: customer,
        updated_at: new Date().toISOString(),
      };
      await writeBillingFileState(state);
      return;
    }

    await db.query(
      `insert into billing_customers (stripe_customer_id, email, name, metadata, updated_at)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, now())
       on conflict (stripe_customer_id) do update
       set email = excluded.email,
           name = excluded.name,
           metadata = excluded.metadata,
           payload = excluded.payload,
           updated_at = now()`,
      [customer.id, customer.email || null, customer.name || null, JSON.stringify(customer.metadata || {}), JSON.stringify(customer)]
    );
  }

  private static async storeSubscription(subscription: StripeObject) {
    const db = getBillingPool();
    if (!subscription?.id || !subscription?.customer) return;

    await this.refreshCustomer(String(subscription.customer));
    const priceId = subscription.items?.data?.[0]?.price?.id || null;

    if (!db) {
      const state = await readBillingFileState();
      state.subscriptions[subscription.id] = {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        stripe_price_id: priceId,
        status: subscription.status || "unknown",
        cancel_at: this.asTimestamp(subscription.cancel_at),
        canceled_at: this.asTimestamp(subscription.canceled_at),
        current_period_start: this.asTimestamp(subscription.current_period_start),
        current_period_end: this.asTimestamp(subscription.current_period_end),
        metadata: subscription.metadata || {},
        payload: subscription,
        updated_at: new Date().toISOString(),
      };
      await writeBillingFileState(state);
      return;
    }

    await db.query(
      `insert into billing_subscriptions (
         stripe_subscription_id,
         stripe_customer_id,
         stripe_price_id,
         status,
         cancel_at,
         canceled_at,
         current_period_start,
         current_period_end,
         metadata,
         payload,
         updated_at
       ) values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9::jsonb, $10::jsonb, now())
       on conflict (stripe_subscription_id) do update
       set stripe_customer_id = excluded.stripe_customer_id,
           stripe_price_id = excluded.stripe_price_id,
           status = excluded.status,
           cancel_at = excluded.cancel_at,
           canceled_at = excluded.canceled_at,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           metadata = excluded.metadata,
           payload = excluded.payload,
           updated_at = now()`,
      [
        subscription.id,
        subscription.customer,
        priceId,
        subscription.status || "unknown",
        this.asTimestamp(subscription.cancel_at),
        this.asTimestamp(subscription.canceled_at),
        this.asTimestamp(subscription.current_period_start),
        this.asTimestamp(subscription.current_period_end),
        JSON.stringify(subscription.metadata || {}),
        JSON.stringify(subscription),
      ]
    );
  }

  private static async storeCheckoutSession(session: StripeObject) {
    const db = getBillingPool();
    if (!session?.id) return;

    if (session.customer) {
      await this.refreshCustomer(String(session.customer));
    }
    if (session.subscription) {
      await this.refreshSubscription(String(session.subscription));
    }

    const lineItemsPriceId =
      session.line_items?.data?.[0]?.price?.id ||
      session.metadata?.price_id ||
      null;

    if (!db) {
      const state = await readBillingFileState();
      state.checkoutSessions[session.id] = {
        stripe_checkout_session_id: session.id,
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
        customer_email: session.customer_details?.email || session.customer_email || null,
        mode: session.mode || "payment",
        status: session.status || null,
        payment_status: session.payment_status || null,
        stripe_price_id: lineItemsPriceId,
        payload: session,
        updated_at: new Date().toISOString(),
      };
      await writeBillingFileState(state);
      return;
    }

    await db.query(
      `insert into billing_checkout_sessions (
         stripe_checkout_session_id,
         stripe_customer_id,
         stripe_subscription_id,
         customer_email,
         mode,
         status,
         payment_status,
         stripe_price_id,
         payload,
         updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
       on conflict (stripe_checkout_session_id) do update
       set stripe_customer_id = excluded.stripe_customer_id,
           stripe_subscription_id = excluded.stripe_subscription_id,
           customer_email = excluded.customer_email,
           mode = excluded.mode,
           status = excluded.status,
           payment_status = excluded.payment_status,
           stripe_price_id = excluded.stripe_price_id,
           payload = excluded.payload,
           updated_at = now()`,
      [
        session.id,
        session.customer || null,
        session.subscription || null,
        session.customer_details?.email || session.customer_email || null,
        session.mode || "payment",
        session.status || null,
        session.payment_status || null,
        lineItemsPriceId,
        JSON.stringify(session),
      ]
    );
  }

  private static async getCustomerBillingStateFromStripe(input: { customerId?: string; email?: string }) {
    let customer: StripeObject | null = null;

    if (input.customerId) {
      customer = await requestJson<StripeObject>(`https://api.stripe.com/v1/customers/${input.customerId}`, {
        headers: this.stripeHeaders(),
      });
    } else if (input.email) {
      const customers = await requestJson<{ data: StripeObject[] }>(
        `https://api.stripe.com/v1/customers?email=${encodeURIComponent(input.email)}&limit=1`,
        { headers: this.stripeHeaders() }
      );
      customer = customers.data[0] || null;
    }

    if (!customer?.id) {
      return { customer: null, subscriptions: [], checkoutSessions: [] };
    }

    const subscriptions = await requestJson<{ data: StripeObject[] }>(
      `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=20`,
      { headers: this.stripeHeaders() }
    );

    const checkoutSessions = await requestJson<{ data: StripeObject[] }>(
      `https://api.stripe.com/v1/checkout/sessions?customer=${encodeURIComponent(customer.id)}&limit=10`,
      { headers: this.stripeHeaders() }
    );

    return {
      customer,
      subscriptions: subscriptions.data,
      checkoutSessions: checkoutSessions.data,
    };
  }
}

