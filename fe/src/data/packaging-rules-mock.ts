export type CartonStatus = 'in_stock' | 'low_stock'

export type CartonBox = {
  id: string
  box_code: string
  length_cm: number
  width_cm: number
  height_cm: number
  max_weight_kg: number
  stock_qty: number
  unit_cost_vnd: number
  status: CartonStatus
}

export const initialCartons: CartonBox[] = [
  {
    id: 'box-1',
    box_code: 'CARTON-A1',
    length_cm: 20,
    width_cm: 12,
    height_cm: 8,
    max_weight_kg: 3,
    stock_qty: 420,
    unit_cost_vnd: 3500,
    status: 'in_stock',
  },
  {
    id: 'box-2',
    box_code: 'CARTON-A2',
    length_cm: 25,
    width_cm: 15,
    height_cm: 10,
    max_weight_kg: 5,
    stock_qty: 280,
    unit_cost_vnd: 4800,
    status: 'in_stock',
  },
  {
    id: 'box-3',
    box_code: 'CARTON-B1',
    length_cm: 30,
    width_cm: 20,
    height_cm: 15,
    max_weight_kg: 8,
    stock_qty: 64,
    unit_cost_vnd: 7200,
    status: 'low_stock',
  },
  {
    id: 'box-4',
    box_code: 'CARTON-C3',
    length_cm: 35,
    width_cm: 25,
    height_cm: 18,
    max_weight_kg: 12,
    stock_qty: 150,
    unit_cost_vnd: 9500,
    status: 'in_stock',
  },
  {
    id: 'box-5',
    box_code: 'CARTON-HD',
    length_cm: 40,
    width_cm: 30,
    height_cm: 25,
    max_weight_kg: 20,
    stock_qty: 38,
    unit_cost_vnd: 14500,
    status: 'low_stock',
  },
  {
    id: 'box-6',
    box_code: 'CARTON-S1',
    length_cm: 15,
    width_cm: 10,
    height_cm: 8,
    max_weight_kg: 1.5,
    stock_qty: 510,
    unit_cost_vnd: 2200,
    status: 'in_stock',
  },
]

export function formatVnd(n: number) {
  return `${n.toLocaleString('vi-VN')} ₫`
}
