import { LineItem } from './line-item';

export interface Order {
  id: string;
  status: string;
  lineItems: LineItem[];
  total: number;
  // Add other order properties as needed
}
