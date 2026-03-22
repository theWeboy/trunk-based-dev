import type { TenantId } from "../../shared/types/index.js";

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderRequest {
  items: OrderItem[];
  currency: string;
}

export interface Order {
  id: string;
  tenantId: TenantId;
  items: OrderItem[];
  currency: string;
  total: number;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
}

export interface CreateOrderResponse {
  order: Order;
  tenantId: TenantId;
  timestamp: string;
}

export interface ListOrdersResponse {
  orders: Order[];
  total: number;
  tenantId: TenantId;
  timestamp: string;
}

export interface OrderHealthResponse {
  status: "ok";
  service: "orders";
  tenantId: TenantId;
  cloud: string;
  timestamp: string;
}
