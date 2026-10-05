import type { ProductCategory } from '../../types/packaging'
import { PRODUCT_CATEGORY_LABELS, materialLabel } from '../../types/packaging'
import type { PlanItemProfile, PlanParcel, PlanPlacement } from '../../types/packing-plan'

/**
 * Dòng thời gian thao tác đóng gói của 1 kiện (05/10/2026).
 * Mỗi action = 1 lần bấm "Tiếp": trải áo → gấp hai bên → gấp thân → cho vào túi
 * → kéo khoá → gập túi → gập đôi → đặt vào thùng; cuối kiện chèn vật tư → đóng nắp
 * → dán băng keo. Hàm thuần: khung 3D và màn đóng gói dùng chung, dựng lại trạng
 * thái chỉ từ chỉ số action (lùi/tiến bao nhiêu lần cũng ra cùng hình).
 */
export type PackActionKind =
  | 'lay_flat'
  | 'fold_sides'
  | 'fold_body'
  | 'bag_insert'
  | 'bag_seal'
  | 'bag_fold'
  | 'fold_half'
  | 'pick'
  | 'place'
  | 'fill'
  | 'close_flaps'
  | 'tape'

/** Thời lượng animation mỗi loại thao tác (giây, tốc độ ×1). */
export const ACTION_SECONDS: Record<PackActionKind, number> = {
  lay_flat: 1.5,
  fold_sides: 2.4,
  fold_body: 2.6,
  bag_insert: 1.9,
  bag_seal: 1.7,
  bag_fold: 1.7,
  fold_half: 1.7,
  pick: 1.1,
  place: 1.7,
  fill: 1.6,
  close_flaps: 2.2,
  tape: 1.5,
}

export type GarmentShape = 'tee' | 'jacket' | 'pants' | 'shorts' | 'dress'

export type PackAction = {
  kind: PackActionKind
  /** Món đang thao tác; null cho các bước cuối kiện. */
  itemKey: string | null
  /** Vị trí món trong thứ tự xếp (0-based); -1 = bước cuối kiện. */
  itemIndex: number
  title: string
  instruction: string
  tip: string | null
}

export type ItemPlan = {
  placement: PlanPlacement
  profile: PlanItemProfile | undefined
  /** null = hàng cứng (giày, dép, phụ kiện, loại khác). */
  shape: GarmentShape | null
  bagged: boolean
  bagFolded: boolean
}

export type PackTimeline = {
  actions: PackAction[]
  items: ItemPlan[]
  /** Chỉ số action "đặt vào thùng" theo itemKey. */
  placeIndex: Map<string, number>
  fillIndex: number
  closeIndex: number
  tapeIndex: number
}

export function garmentShape(category: ProductCategory | null | undefined): GarmentShape | null {
  switch (category) {
    case 't_shirt':
    case 'shirt':
      return 'tee'
    case 'jacket':
      return 'jacket'
    case 'trousers':
      return 'pants'
    case 'shorts':
      return 'shorts'
    case 'dress':
      return 'dress'
    default:
      return null
  }
}

function cm(mm: number, vi: boolean): string {
  return (mm / 10).toLocaleString(vi ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })
}

export function buildPackingTimeline(
  parcel: PlanParcel,
  itemProfiles: PlanItemProfile[],
  vi: boolean,
): PackTimeline {
  const profiles = new Map(itemProfiles.map((p) => [p.sku, p]))
  const ordered = [...parcel.placements].sort((a, b) => a.step - b.step)
  const actions: PackAction[] = []
  const placeIndex = new Map<string, number>()
  const items: ItemPlan[] = []

  ordered.forEach((p, itemIndex) => {
    const profile = profiles.get(p.sku)
    const category = profile?.productCategory ?? null
    const shape = garmentShape(category)
    const bagged = shape !== null && Boolean(profile?.zipBagCode)
    const bagFolded = bagged && Boolean(profile?.zipBagFolded)
    items.push({ placement: p, profile, shape, bagged, bagFolded })
    const kind = category ? PRODUCT_CATEGORY_LABELS[category][vi ? 'vi' : 'en'].toLowerCase() : vi ? 'món hàng' : 'item'
    const push = (k: PackActionKind, title: string, instruction: string, tip: string | null = null) =>
      actions.push({ kind: k, itemKey: p.itemKey, itemIndex, title, instruction, tip })
    const size = `${cm(p.dx, vi)}×${cm(p.dy, vi)} cm`

    if (shape === null) {
      const box = category === 'shoes'
      push(
        'pick',
        vi ? (box ? 'Lấy hộp giày' : 'Lấy món hàng') : box ? 'Take the shoe box' : 'Take the item',
        vi
          ? `Lấy ${kind} ${p.sku}, kiểm tra hộp không móp, đặt lên bàn đóng gói.`
          : `Take ${kind} ${p.sku}, check it is undamaged and set it on the packing table.`,
      )
    } else {
      const sidesTitle =
        shape === 'pants' || shape === 'shorts'
          ? vi
            ? 'Gấp ống quần chồng lên nhau'
            : 'Fold one leg over the other'
          : shape === 'dress'
            ? vi
              ? 'Gấp hai mép váy vào giữa'
              : 'Fold both sides to the centre'
            : vi
              ? 'Gấp tay áo và hai bên thân'
              : 'Fold sleeves and sides in'
      const bodyTitle = shape === 'shorts' ? (vi ? 'Gấp đôi theo chiều dài' : 'Fold in half lengthwise') : vi ? 'Gấp thân làm ba' : 'Fold the body in thirds'
      push(
        'lay_flat',
        vi ? 'Trải phẳng trên thảm' : 'Lay flat on the mat',
        vi
          ? `Trải ${kind} ${p.sku} phẳng trên thảm, mặt trước úp xuống, vuốt hết nếp nhăn.`
          : `Lay ${kind} ${p.sku} flat on the mat, front side down, and smooth out wrinkles.`,
      )
      push(
        'fold_sides',
        sidesTitle,
        shape === 'pants' || shape === 'shorts'
          ? vi
            ? 'Gấp đôi quần theo đường giữa để hai ống chồng khít lên nhau.'
            : 'Fold the pants along the centre so both legs line up.'
          : vi
            ? 'Gấp từng bên vào giữa, thẳng mép, tay áo nằm dọc theo thân.'
            : 'Fold each side to the centre with straight edges; sleeves lie along the body.',
      )
      push(
        'fold_body',
        bodyTitle,
        vi
          ? `Gấp từ dưới lên cho gọn, gói còn khoảng ${size}${p.folded || bagFolded ? ' trước khi gập tiếp' : ''}.`
          : `Fold from the bottom up into a neat bundle about ${size}${p.folded || bagFolded ? ' before the final fold' : ''}.`,
      )
      if (bagged) {
        const code = profile?.zipBagCode ?? ''
        push(
          'bag_insert',
          vi ? `Cho vào túi ${code}` : `Slide into bag ${code}`,
          vi ? `Mở miệng túi zip ${code}, luồn gói áo vào sát đáy túi.` : `Open zip bag ${code} and slide the bundle all the way in.`,
        )
        push(
          'bag_seal',
          vi ? 'Kéo khoá túi' : 'Seal the bag',
          vi ? 'Ép nhẹ cho thoát khí rồi kéo khoá từ đầu này sang đầu kia.' : 'Press out the air, then run the zip from one end to the other.',
          vi ? 'Túi còn phồng sẽ chiếm thêm chỗ trong thùng.' : 'A puffy bag takes extra room in the box.',
        )
        if (bagFolded)
          push(
            'bag_fold',
            vi ? 'Gập đôi túi' : 'Fold the bag in half',
            vi ? 'Gập đôi túi theo chiều dài, mép khoá nằm trong.' : 'Fold the bag in half lengthwise with the zip inside.',
          )
      }
      if (p.folded)
        push(
          'fold_half',
          vi ? 'Gập đôi gói hàng' : 'Fold the bundle in half',
          vi ? `Gập đôi theo chiều dài để vừa ô ${size} trong thùng.` : `Fold in half lengthwise to fit the ${size} slot.`,
        )
    }

    placeIndex.set(p.itemKey, actions.length)
    const guide = parcel.guide?.steps.find((s) => s.step === p.step)
    const where = p.z === 0 ? (vi ? 'sát đáy thùng' : 'on the carton floor') : vi ? 'lên lớp bên dưới' : 'on the layer below'
    push(
      'place',
      vi ? 'Đặt vào thùng' : 'Place in the box',
      guide?.instruction ?? (vi ? `Đặt ${p.sku} ${where}, dồn sát góc như hình.` : `Place ${p.sku} ${where}, tight into the corner shown.`),
      guide?.tip ?? null,
    )
  })

  const finish = (k: PackActionKind, title: string, instruction: string, tip: string | null = null) =>
    actions.push({ kind: k, itemKey: null, itemIndex: -1, title, instruction, tip })
  const fillIndex = actions.length
  const materials = parcel.materials
  finish(
    'fill',
    vi ? 'Chèn vật tư' : 'Add filler',
    materials.length > 0
      ? `${vi ? 'Chèn' : 'Add'} ${materials.map((m) => `${String(m.quantity)} ${m.unit} ${materialLabel(m, vi).toLowerCase()}`).join(', ')} ${
          vi ? 'vào khe trống để hàng không xê dịch.' : 'into the gaps so nothing shifts.'
        }`
      : vi
        ? 'Lắc nhẹ thùng: hàng không xê dịch thì không cần chèn thêm.'
        : 'Shake the box gently: if nothing shifts, no filler is needed.',
    vi ? 'Vị trí vật tư trên hình chỉ để minh hoạ.' : 'Filler positions in the view are illustrative.',
  )
  const closeIndex = actions.length
  finish(
    'close_flaps',
    vi ? 'Gập nắp thùng' : 'Close the flaps',
    vi ? 'Gập hai nắp ngắn vào trước, rồi gập hai nắp dài phủ lên.' : 'Fold the two short flaps first, then the two long flaps over them.',
  )
  const tapeIndex = actions.length
  finish(
    'tape',
    vi ? 'Dán băng keo' : 'Tape the box',
    vi ? 'Dán băng keo chữ I dọc khe giữa hai nắp dài, dư khoảng 5 cm mỗi đầu.' : 'Run one strip of tape along the seam, about 5 cm over each end.',
  )

  return { actions, items, placeIndex, fillIndex, closeIndex, tapeIndex }
}
