import bcrypt from "bcryptjs";

export class PasswordHasher {
  hash(value) {
    return bcrypt.hash(value, 12);
  }

  verify(value, hash) {
    return bcrypt.compare(value, hash);
  }
}
