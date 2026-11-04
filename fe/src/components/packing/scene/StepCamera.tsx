import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Vector3 } from 'three'

/** Vùng cần nằm trọn trong khung hình; gốc = tâm thùng, đơn vị mét. */
export type CameraFocus = {
  center: [number, number]
  /** Rộng theo x, sâu theo z. */
  width: number
  depth: number
  height: number
}

const VIEW_DIRECTION = new Vector3(0.3, 1.05, 1.05).normalize()
const FOV_DEGREES = 40
/** Bảng hướng dẫn che phần dưới khung: chừa thêm chỗ và đẩy cảnh lên trên. */
const PANEL_ROOM = 1.3
const PANEL_SHIFT = 0.12
const MOVE_SECONDS = 1.1

type Controls = {
  target: Vector3
  update: () => void
  addEventListener: (type: 'start', listener: () => void) => void
  removeEventListener: (type: 'start', listener: () => void) => void
}

function goalFor(focus: CameraFocus, aspect: number): { position: Vector3; target: Vector3 } {
  const tanHalf = Math.tan(MathUtils.degToRad(FOV_DEGREES / 2))
  const elevation = Math.asin(VIEW_DIRECTION.y)
  const projected = focus.depth * Math.sin(elevation) + focus.height * Math.cos(elevation)
  const distance =
    Math.max(focus.width / 2 / (tanHalf * Math.max(aspect, 0.1)), (projected * PANEL_ROOM) / 2 / tanHalf) * 1.15
  const target = new Vector3(focus.center[0], focus.height * 0.3, focus.center[1] + projected * PANEL_SHIFT)
  return { target, position: target.clone().addScaledVector(VIEW_DIRECTION, distance) }
}

/**
 * Đưa camera tới vùng của bước hiện tại, theo tỉ lệ khung thật nên khung hẹp vẫn thấy trọn.
 * Người dùng kéo xoay thì nhường lại ngay; sang bước khác mới chỉnh tiếp.
 */
export function StepCamera({ focus, resetKey }: { focus: CameraFocus; resetKey: number }): null {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as Controls | null
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const goal = useMemo(() => goalFor(focus, width / Math.max(height, 1)), [focus, width, height])
  const remaining = useRef(0)
  const snap = useRef(true)

  useEffect(() => {
    remaining.current = MOVE_SECONDS
  }, [goal])

  useEffect(() => {
    snap.current = true
  }, [resetKey])

  useEffect(() => {
    if (!controls) return
    const release = (): void => {
      remaining.current = 0
    }
    controls.addEventListener('start', release)
    return () => controls.removeEventListener('start', release)
  }, [controls])

  useFrame((_, dt) => {
    if (!controls) return
    if (snap.current) {
      snap.current = false
      remaining.current = 0
      camera.position.copy(goal.position)
      controls.target.copy(goal.target)
      controls.update()
      return
    }
    if (remaining.current <= 0) return
    remaining.current -= dt
    const blend = 1 - Math.exp(-5 * dt)
    camera.position.lerp(goal.position, blend)
    controls.target.lerp(goal.target, blend)
    controls.update()
  })

  return null
}
