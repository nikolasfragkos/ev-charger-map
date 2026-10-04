export type Charger = {
  id: string;
  lat: number;
  lng: number;
  status: "available" | "in_use" | "outage";

  name: string;
  address: string;
  providerName?: string;

  connectorType: "CCS" | "CHADEMO" | "TYPE2";
  maxKW: number;
  kwhprice: number;
  reserved_by_me?: boolean;
};