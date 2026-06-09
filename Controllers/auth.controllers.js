import User from "../Models/user.model.js";
import bcrypt from "bcryptjs";

export const registerUser = async (req, res) => {
    try {
        const {name, email, password} = req.body;
        const existEmail = await User.findOne({ email });
        if(existEmail){
            return res.status(400).json({message: "Email already exists"});
        }
        if(password.length < 6){
            return res.status(400).json({message: "Password must be at least 6 characters long"});
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        

        const user = await User.create({name, email, password: hashedPassword});
        res.status(201).json({message: "User created successfully", user});
    } catch (error) {
        console.error("Register user error:", error);
        res.status(500).json({message: "Internal server error"});
    }
};
