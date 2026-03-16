import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const ListCustomersSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  email: z.string().optional().describe("Optional customer email filter"),
  agentName: z.string().describe("Agent requesting access")
});

const ListProductsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  activeOnly: z.boolean().optional().default(true),
  agentName: z.string().describe("Agent requesting access")
});

const ListPaymentIntentsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  customer: z.string().optional().describe("Optional customer ID"),
  agentName: z.string().describe("Agent requesting access")
});

const CreateCustomerSchema = z.object({
  email: z.string().email().describe("Customer email"),
  name: z.string().optional().describe("Customer name"),
  description: z.string().optional().describe("Customer description"),
  agentName: z.string().describe("Agent requesting access")
});

export class StripeIntegration {
  private static getHeaders(): Record<string, string> {
    if (!config.STRIPE_SECRET_KEY) {
      throw new Error("Stripe secret key not configured. Set STRIPE_SECRET_KEY in environment variables.");
    }

    return {
      Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
  }

  private static buildBody(values: Record<string, string | number | boolean | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
    return params.toString();
  }

  static async listCustomers(input: z.infer<typeof ListCustomersSchema>) {
    const { limit, email, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "stripe", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Stripe`);
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (email) params.set("email", email);

    const response = await requestJson<{ data: Record<string, unknown>[] }>(
      `https://api.stripe.com/v1/customers?${params.toString()}`,
      { headers: this.getHeaders() }
    );

    logger.info(`Agent ${agentName} listed Stripe customers`, { count: response.data.length });
    return { customers: response.data, count: response.data.length };
  }

  static async listProducts(input: z.infer<typeof ListProductsSchema>) {
    const { limit, activeOnly, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "stripe", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Stripe`);
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (activeOnly) params.set("active", "true");

    const response = await requestJson<{ data: Record<string, unknown>[] }>(
      `https://api.stripe.com/v1/products?${params.toString()}`,
      { headers: this.getHeaders() }
    );

    logger.info(`Agent ${agentName} listed Stripe products`, { count: response.data.length });
    return { products: response.data, count: response.data.length };
  }

  static async listPaymentIntents(input: z.infer<typeof ListPaymentIntentsSchema>) {
    const { limit, customer, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "stripe", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Stripe`);
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (customer) params.set("customer", customer);

    const response = await requestJson<{ data: Record<string, unknown>[] }>(
      `https://api.stripe.com/v1/payment_intents?${params.toString()}`,
      { headers: this.getHeaders() }
    );

    logger.info(`Agent ${agentName} listed Stripe payment intents`, { count: response.data.length });
    return { paymentIntents: response.data, count: response.data.length };
  }

  static async createCustomer(input: z.infer<typeof CreateCustomerSchema>) {
    const { email, name, description, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "stripe", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Stripe`);
    }

    const customer = await requestJson<Record<string, unknown>>("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: this.getHeaders(),
      body: this.buildBody({ email, name, description })
    });

    logger.info(`Agent ${agentName} created Stripe customer`, { email });
    return { customer };
  }
}

export const stripeTools = [
  {
    name: "stripe_list_customers",
    description: "List Stripe customers",
    inputSchema: ListCustomersSchema,
    handler: StripeIntegration.listCustomers.bind(StripeIntegration)
  },
  {
    name: "stripe_list_products",
    description: "List Stripe products",
    inputSchema: ListProductsSchema,
    handler: StripeIntegration.listProducts.bind(StripeIntegration)
  },
  {
    name: "stripe_list_payment_intents",
    description: "List Stripe payment intents",
    inputSchema: ListPaymentIntentsSchema,
    handler: StripeIntegration.listPaymentIntents.bind(StripeIntegration)
  },
  {
    name: "stripe_create_customer",
    description: "Create a Stripe customer",
    inputSchema: CreateCustomerSchema,
    handler: StripeIntegration.createCustomer.bind(StripeIntegration)
  }
];
