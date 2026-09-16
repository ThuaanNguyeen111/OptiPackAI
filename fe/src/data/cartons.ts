export interface Carton {
  code: string
  length: number
  width: number
  height: number
  maxWeight: string
  unitCost: number
}

export const CARTON_INVENTORY: Carton[] = [
  {
    code: 'CARTON-S1',
    length: 15,
    width: 10,
    height: 8,
    maxWeight: '1.5 kg',
    unitCost: 2200,
  },
  {
    code: 'CARTON-A1',
    length: 20,
    width: 12,
    height: 8,
    maxWeight: '3 kg',
    unitCost: 3500,
  },
  {
    code: 'CARTON-A2',
    length: 25,
    width: 15,
    height: 10,
    maxWeight: '5 kg',
    unitCost: 4800,
  },
  {
    code: 'CARTON-B1',
    length: 30,
    width: 20,
    height: 15,
    maxWeight: '8 kg',
    unitCost: 7200,
  },
  {
    code: 'CARTON-C3',
    length: 35,
    width: 25,
    height: 18,
    maxWeight: '12 kg',
    unitCost: 9500,
  },
  {
    code: 'CARTON-HD',
    length: 40,
    width: 30,
    height: 25,
    maxWeight: '20 kg',
    unitCost: 14500,
  },
]

export const DEFAULT_CARTON_CODE = 'CARTON-A2'

export function getCartonByCode(code: string): Carton {
  return (
    CARTON_INVENTORY.find((c) => c.code === code) ??
    CARTON_INVENTORY.find((c) => c.code === DEFAULT_CARTON_CODE)!
  )
}

export function formatCartonDimensions(carton: Carton) {
  return `${carton.length} × ${carton.width} × ${carton.height} cm`
}
