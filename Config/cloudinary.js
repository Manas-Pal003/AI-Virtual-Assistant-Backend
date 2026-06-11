import {v2 as cloudinary} from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
    cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
    api_key:process.env.CLOUDINARY_API_KEY,
    api_secret:process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary=async (localFilePath)=>{
    try {
        if(!localFilePath) return null;
        const response=await cloudinary.uploader.upload(localFilePath,{
            folder:"users"
        })
        fs.unlinkSync(localFilePath);
        console.log(response.url);
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath);
        return res.status(500).json({message:"cloudinary error"});
    }
}

export default uploadOnCloudinary;
