/** Tipos, cobrança e resumo de valores de produtos e serviços (Sprint 12 B6). */

export type ProductKind = "product" | "service" | "subscription";
export type ProductBilling = "one_time" | "monthly" | "yearly" | "hourly";
export type BusinessModel = "b2b" | "b2c" | "b2b2c" | "mixed";
export type Sells = "products" | "services" | "both";

export const KIND_LABELS: Record<ProductKind, string> = {
  product: "Produto",
  service: "Serviço",
  subscription: "Assinatura",
};

export const BILLING_LABELS: Record<ProductBilling, string> = {
  one_time: "Cobrança única",
  monthly: "Mensal",
  yearly: "Anual",
  hourly: "Por hora",
};

export const BILLING_SUFIXO: Record<ProductBilling, string> = {
  one_time: "",
  monthly: "/mês",
  yearly: "/ano",
  hourly: "/h",
};

export const BUSINESS_MODEL_LABELS: Record<BusinessModel, { label: string; description: string }> = {
  b2b: { label: "B2B", description: "Vendo para empresas. Todo negócio tem uma empresa." },
  b2c: { label: "B2C", description: "Vendo para pessoas. O negócio é com o contato." },
  b2b2c: { label: "B2B2C", description: "Vendo para empresas que atendem pessoas. Empresa e contato final." },
  mixed: { label: "Misto", description: "Vendo para empresas e pessoas. Empresa opcional." },
};

export const SELLS_LABELS: Record<Sells, string> = {
  products: "Produtos",
  services: "Serviços",
  both: "Produtos/Serviços",
};

export interface ItemValor {
  quantity: number;
  unit_price: number;
  billing?: ProductBilling | null;
}

export interface ResumoValores {
  /** Cobrança única (produtos, taxas, pacotes). */
  avulso: number;
  /** Recorrência normalizada por mês (anual dividido por 12). */
  mensal: number;
  /** Recorrência normalizada por ano. */
  anual: number;
  /** Por hora, sem normalizar (depende das horas contratadas). */
  porHora: number;
}

/** Soma os itens por forma de cobrança. `deals.value` continua a soma simples dos totais. */
export function resumoValores(itens: ItemValor[]): ResumoValores {
  const r: ResumoValores = { avulso: 0, mensal: 0, anual: 0, porHora: 0 };
  for (const it of itens) {
    const total = Number(it.quantity ?? 0) * Number(it.unit_price ?? 0);
    switch (it.billing ?? "one_time") {
      case "monthly": r.mensal += total; r.anual += total * 12; break;
      case "yearly": r.anual += total; r.mensal += total / 12; break;
      case "hourly": r.porHora += total; break;
      default: r.avulso += total;
    }
  }
  return r;
}

/** Em B2B o negócio precisa de empresa; nos demais modelos ela é opcional. */
export function exigeEmpresa(model: string | null | undefined): boolean {
  return model === "b2b";
}

/** Em B2C a empresa não faz sentido no negócio. */
export function escondeEmpresa(model: string | null | undefined): boolean {
  return model === "b2c";
}
