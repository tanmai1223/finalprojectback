import Control from "../models/controls.js";

export const putControls = async (req, res) => {
  try {
    const { endpoint,timestamp, limitValues, scheduleValues, toggles } = req.body;

    if (!endpoint) {
      return res.status(400).json({ status: "error", message: "Endpoint is required" });
    }

    // Find the document by endpoint and update it, or create if it doesn't exist
    const data = await Control.findOneAndUpdate(
      { endpoint }, // filter
      { limitValues, scheduleValues, toggles }, // update
      { new: true, upsert: true, setDefaultsOnInsert: true } // options
    );

    res.status(200).json({
      status: "success",
      message: "Control updated or added",
      data,
    });
  } catch (error) {
    console.error("Error saving control:", error);
    res.status(500).json({ status: "error", message: "Failed to update or add control" });
  }
};

export const getControls=async(req,res)=>{
  try{
    const data =await Control.find().sort({ "timestamp": 1 });
    res.status(200).json({message:"success",data})

  }catch(error){
    res.status(500).json({status:"error",message:"Failed to fetch control"})
  }
}