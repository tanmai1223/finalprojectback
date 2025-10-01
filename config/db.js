import mongoose from "mongoose";

const db = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Database connection sucessful!!");
  } catch (err) {
    console.log("Error :", err);
    process.exit(1);
  }
};

export default db;