import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const SECRET = process.env.JWT_SECRET;

export function generateApiKey(clientName, expiresIn = "30d") {
  if (!SECRET) throw new Error("JWT_SECRET is missing");

  const payload = { client: clientName };
  
  return jwt.sign(payload, SECRET, { expiresIn });
}
