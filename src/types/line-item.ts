import { Product } from './product';

export interface LineItem {
  id: string;
  product: Product;
  quantity: number;
  price: number;
}
