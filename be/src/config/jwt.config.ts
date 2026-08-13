import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  //!=============================================
  // FIX: dùng SỐ GIÂY (number) thay vì chuỗi "1d"/"30d". Lý do: @nestjs/jwt
  // yêu cầu `expiresIn` kiểu `number | StringValue` — StringValue là
  // template-literal type rất kén (chỉ nhận đúng pattern như `${number}d`),
  // configService.get<string>() trả về `string` chung chung không khớp được.
  // Dùng number né hẳn vấn đề, không cần ép kiểu.
  //!=============================================
  expiresIn: Number(process.env.JWT_EXPIRES_IN ?? 86400), // mặc định 1 ngày (giây)
  refreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN ?? 2592000), // mặc định 30 ngày (giây)
}));
