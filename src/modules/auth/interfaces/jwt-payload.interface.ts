export interface JwtPayload {
  sub: string;
  companyId: string | null;
}

export interface JwtRefreshPayload extends JwtPayload {
  jti: string;
}
