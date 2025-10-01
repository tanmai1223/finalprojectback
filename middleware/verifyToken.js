import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const SECRET = process.env.JWT_SECRET;

export function jwtMiddleware(req, res, next) {
  const token = req.header("x-api-key");
 
  if (!token) 
    return res.status(401).json({ error: "API key missing" });
   
  try {
    const decoded = jwt.verify(token, SECRET); 
    req.apiKeyInfo = decoded; 
    
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired API key" });
  }
}