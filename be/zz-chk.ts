import 'reflect-metadata';
import { PickEventSchema } from './src/modules/order-groups/schemas/pick-event.schema';
import { NotificationSchema } from './src/modules/notifications/schemas/notification.schema';
import { SkuBinAssignmentSchema } from './src/modules/warehouse/schemas/sku-bin-assignment.schema';
for (const [n,s,p] of [['pick',PickEventSchema,'order_group_id'],['notif',NotificationSchema,'recipient_user_id'],['sba',SkuBinAssignmentSchema,'warehouse_id']] as any) console.log(n,p,s.path(p).instance);
