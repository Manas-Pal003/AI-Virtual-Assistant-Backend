import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    assistantName: {
        type: String,
        default:""  
    },
    assistantImage: {
        type: String,
        default:""  
    },
    history: [
        { type: String }
    ]
    // avatar: {
    //     type: String,
    //     required: true
    // }
}, {
    timestamps: true
})

const User = mongoose.model("User", userSchema);

export default User;