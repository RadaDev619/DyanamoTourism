// models/Admin.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

const AdminSchema = new Schema(
    {
        firstName: { type: String, trim: true, required: true },
        lastName: { type: String, trim: true, required: true },

        email: {
            type: String,
            required: true,
            unique: true,
            index: true,
            lowercase: true,
            trim: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"]
        },

        // Stored hash (plaintext never stored). Not selected by default for safety.
        passwordHash: { type: String, required: true, select: false },

        role: {
            type: String,
            enum: ["SUPER_ADMIN", "ADMIN", "STAFF"],
            default: "ADMIN",
            index: true
        },
        permissions: { type: [String], default: [] },

        // Account status
        isActive: { type: Boolean, default: true },

        // Email verification
        emailVerified: { type: Boolean, default: false },
        emailVerifyToken: { type: String, select: false },
        emailVerifyTokenExpires: { type: Date, select: false },

        // Password reset
        resetPasswordToken: { type: String, select: false },
        resetPasswordExpires: { type: Date, select: false },

        // Optional 2FA (e.g., TOTP)
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String, select: false },

        // Auth telemetry / lockout
        lastLoginAt: { type: Date },
        loginAttempts: { type: Number, default: 0 },
        lockUntil: { type: Date, index: true },

        // Optional profile/extras
        avatarUrl: { type: String }
    },
    {
        timestamps: true,
        toJSON: {
            transform(_doc, ret) {
                delete ret.passwordHash;
                delete ret.resetPasswordToken;
                delete ret.resetPasswordExpires;
                delete ret.emailVerifyToken;
                delete ret.emailVerifyTokenExpires;
                delete ret.twoFactorSecret;
                return ret;
            }
        }
    }
);

// -------- Virtuals --------
// Allow setting plaintext password during registration: admin.password = "secret"
AdminSchema.virtual("password")
    .set(function (pw) { this._password = pw; })
    .get(function () { return undefined; });

// Convenience full name
AdminSchema.virtual("fullName").get(function () {
    return `${this.firstName} ${this.lastName}`.trim();
});

// Locked?
AdminSchema.virtual("isLocked").get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// -------- Hooks --------
AdminSchema.pre("save", async function (next) {
    try {
        if (this._password) {
            const salt = await bcrypt.genSalt(12);
            this.passwordHash = await bcrypt.hash(this._password, salt);
        }
        next();
    } catch (err) {
        next(err);
    }
});

// -------- Methods --------
AdminSchema.methods.comparePassword = async function (candidate) {
    // Make sure passwordHash is loaded if you queried with select('+passwordHash')
    return bcrypt.compare(candidate, this.passwordHash);
};

AdminSchema.methods.recordSuccessfulLogin = function () {
    this.lastLoginAt = new Date();
    this.loginAttempts = 0;
    this.lockUntil = undefined;
};

AdminSchema.methods.incLoginAttempts = function () {
    const LOCK_TIME_MS = 30 * 60 * 1000; // 30 minutes
    if (this.lockUntil && this.lockUntil < Date.now()) {
        // Lock expired: reset counters
        this.loginAttempts = 1;
        this.lockUntil = undefined;
    } else {
        this.loginAttempts += 1;
        if (this.loginAttempts >= 5 && !this.isLocked) {
            this.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        }
    }
    return this.save();
};

// -------- Indexes --------
AdminSchema.index({ email: 1 }, { unique: true });

export default mongoose.model("Admin", AdminSchema);
