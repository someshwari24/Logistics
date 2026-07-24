require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

/* -------------------------------------------------
   ENVIRONMENT VARIABLE VALIDATION
------------------------------------------------- */

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing from the .env file.");
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing from the .env file.");
  process.exit(1);
}

/* -------------------------------------------------
   MIDDLEWARE
------------------------------------------------- */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve HTML, CSS, JS and images
app.use(express.static(path.join(__dirname)));

/* -------------------------------------------------
   DATABASE CONNECTION
------------------------------------------------- */

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully.");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  });

/* -------------------------------------------------
   USER SCHEMA
------------------------------------------------- */

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },
  },
  {
    collection: "users",
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

/* -------------------------------------------------
   ASSISTANT SCHEMA
------------------------------------------------- */

const assistantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phonenumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "assistants",
    timestamps: true,
  }
);

const Assistant = mongoose.model("Assistant", assistantSchema);
/* -------------------------------------------------
   ORDER / ADDRESS SCHEMA
------------------------------------------------- */

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assistantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
    },

    shoppingDate: {
      type: Date,
      required: true,
    },

    shoppingTime: {
      type: String,
      required: true,
    },

    item: {
      type: String,
      required: true,
      trim: true,
    },

    mobile: {
      type: String,
      required: true,
      trim: true,
    },

    language: {
      type: String,
      required: true,
      trim: true,
    },

    currentStatus: {
      type: String,
      enum: [
        "request_created",
        "assistant_assigned",
        "packed",
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
      ],
      default: "assistant_assigned",
    },
  },
  {
    collection: "addresses",
    timestamps: true,
  }
);

const Address = mongoose.model("Address", addressSchema);

/* -------------------------------------------------
   COMPLAINT SCHEMA
------------------------------------------------- */

const complaintSchema = new mongoose.Schema(
  {
    assistantNumber: {
      type: String,
      required: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "complaints",
  }
);

complaintSchema.index(
  {
    assistantNumber: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

const Complaint = mongoose.model("Complaint", complaintSchema);

/* -------------------------------------------------
   DELIVERY CONFIRMATION SCHEMA
------------------------------------------------- */

const confirmationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "received",
        "not_received",
        "problem_with_assistant",
      ],
      required: true,
    },

    confirmedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "confirmations",
  }
);

confirmationSchema.index(
  {
    userId: 1,
    orderId: 1,
  },
  {
    unique: true,
  }
);

const Confirmation = mongoose.model(
  "Confirmation",
  confirmationSchema
);

/* -------------------------------------------------
   ORDER UPDATE SCHEMA
------------------------------------------------- */

const orderUpdateSchema = new mongoose.Schema(
  {
    assistantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assistant",
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "packed",
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
      ],
      required: true,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "orderUpdates",
  }
);

const OrderUpdate = mongoose.model(
  "OrderUpdate",
  orderUpdateSchema
);

/* -------------------------------------------------
   HELPER FUNCTIONS
------------------------------------------------- */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^\d{10,15}$/.test(phone);
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeStatus(status) {
  if (!status || typeof status !== "string") {
    return "";
  }

  return status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function createUserToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: "user",
      name: user.name,
    },
    JWT_SECRET,
    {
      expiresIn: "1h",
    }
  );
}

function createAssistantToken(assistant) {
  return jwt.sign(
    {
      assistantId: assistant._id.toString(),
      role: "assistant",
      name: assistant.name,
    },
    JWT_SECRET,
    {
      expiresIn: "1h",
    }
  );
}

async function getAssistantDetails(city, state) {
  const escapedCity = city.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const escapedState = state.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  return Assistant.findOne({
    city: {
      $regex: new RegExp(`^${escapedCity.trim()}$`, "i"),
    },
    state: {
      $regex: new RegExp(`^${escapedState.trim()}$`, "i"),
    },
    isAvailable: true,
  });
}
/* -------------------------------------------------
   AUTHENTICATION MIDDLEWARE
------------------------------------------------- */

function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      message: "Authentication token is missing.",
    });
  }

  const token = authorization.split(" ")[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(403).json({
      message: "Invalid or expired authentication token.",
    });
  }
}

function userOnly(req, res, next) {
  if (req.user.role !== "user" || !req.user.userId) {
    return res.status(403).json({
      message: "Only customers can perform this operation.",
    });
  }

  next();
}

function assistantOnly(req, res, next) {
  if (
    req.user.role !== "assistant" ||
    !req.user.assistantId
  ) {
    return res.status(403).json({
      message: "Only assistants can perform this operation.",
    });
  }

  next();
}

/* -------------------------------------------------
   BASIC ROUTES
------------------------------------------------- */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "home.html"));
});

app.get("/health", (req, res) => {
  res.status(200).json({
    message: "Hakuna Express server is running.",
  });
});

/* -------------------------------------------------
   USER SIGNUP
------------------------------------------------- */

app.post("/signup", async (req, res) => {
  try {
    let { name, username, email, password } = req.body;

    name = name?.trim() || username?.trim();
    username = username?.trim();
    email = email?.trim().toLowerCase();

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        message: "Username must contain at least 3 characters.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Enter a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters.",
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(409).json({
        message:
          existingUser.email === email
            ? "Email is already registered."
            : "Username is already taken.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      username,
      email,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: "User registered successfully.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Signup error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Email or username is already registered.",
      });
    }

    return res.status(500).json({
      message: "Server error while registering user.",
    });
  }
});

/* -------------------------------------------------
   USER LOGIN
------------------------------------------------- */

app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    email = email?.trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = createUserToken(user);

    return res.status(200).json({
      message: "Login successful",
      token,
      username: user.username,
      name: user.name,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Server error while logging in.",
    });
  }
});

/* -------------------------------------------------
   USER DETAILS
------------------------------------------------- */

app.get(
  "/me",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId).select(
        "name username email"
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      return res.status(200).json({
        name: user.name,
        username: user.username,
        email: user.email,
      });
    } catch (error) {
      console.error("Get user error:", error);

      return res.status(500).json({
        message: "Server error while retrieving user.",
      });
    }
  }
);
/* -------------------------------------------------
   SUBMIT SHOPPING REQUEST
------------------------------------------------- */

app.post(
  "/submit-details",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      let {
        name,
        address,
        city,
        state,
        pincode,
        mobile,
        item,
        language,
        date,
        time,
      } = req.body;

      name = name?.trim();
      address = address?.trim();
      city = city?.trim();
      state = state?.trim();
      pincode = pincode?.trim();
      mobile = mobile?.replace(/[^\d]/g, "");
      item = item?.trim();
      language = language?.trim();

      if (
        !name ||
        !address ||
        !city ||
        !state ||
        !pincode ||
        !mobile ||
        !item ||
        !language ||
        !date ||
        !time
      ) {
        return res.status(400).json({
          message: "All shopping-request fields are required.",
        });
      }

      if (!/^\d{6}$/.test(pincode)) {
        return res.status(400).json({
          message: "Enter a valid 6-digit pincode.",
        });
      }

      if (!isValidPhone(mobile)) {
        return res.status(400).json({
          message: "Enter a valid mobile number.",
        });
      }

      const shoppingDate = new Date(date);

      if (Number.isNaN(shoppingDate.getTime())) {
        return res.status(400).json({
          message: "Enter a valid shopping date.",
        });
      }

      const assistant = await getAssistantDetails(city, state);

      if (!assistant) {
        return res.status(404).json({
          message:
            "No assistant is available in your city and state.",
        });
      }

      const order = await Address.create({
        userId: req.user.userId,
        assistantId: assistant._id,
        name,
        address,
        city,
        state,
        pincode,
        shoppingDate,
        shoppingTime: time,
        item,
        mobile,
        language,
        currentStatus: "assistant_assigned",
      });

      const whatsappMessage =
        `Hello, I need help shopping for ${item}. ` +
        `My name is ${name}. ` +
        `Shopping date: ${date}. ` +
        `Shopping time: ${time}. ` +
        `Order ID: ${order._id}.`;

      const whatsappLink =
        `https://wa.me/${assistant.phonenumber}` +
        `?text=${encodeURIComponent(whatsappMessage)}`;

      return res.status(201).json({
        message: "Shopping request created successfully.",
        orderId: order._id,
        whatsappLink,
        assistantName: assistant.name,
        assistantPhone: assistant.phonenumber,
      });
    } catch (error) {
      console.error("Submit shopping request error:", error);

      return res.status(500).json({
        message: "Error while creating shopping request.",
      });
    }
  }
);

/* -------------------------------------------------
   GET USER ORDERS
------------------------------------------------- */

app.get(
  "/get-user-address",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const orders = await Address.find({
        userId: req.user.userId,
      })
        .populate("assistantId", "name phonenumber")
        .sort({ createdAt: -1 });

      const confirmations = await Confirmation.find({
        userId: req.user.userId,
      });

      const confirmationMap = new Map(
        confirmations.map((confirmation) => [
          confirmation.orderId.toString(),
          confirmation.status,
        ])
      );

      const result = orders.map((order) => ({
        ...order.toObject(),
        status:
          confirmationMap.get(order._id.toString()) ||
          order.currentStatus,
      }));

      return res.status(200).json(result);
    } catch (error) {
      console.error("Get user orders error:", error);

      return res.status(500).json({
        message: "Failed to retrieve shopping requests.",
      });
    }
  }
);

/* -------------------------------------------------
   ASSISTANT LOGIN
------------------------------------------------- */

app.post("/assistant-login", async (req, res) => {
  try {
    let { phone } = req.body;

    phone = phone?.replace(/[^\d]/g, "");

    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required.",
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        message: "Enter a valid phone number.",
      });
    }

    const assistant = await Assistant.findOne({
      phonenumber: phone,
    });

    if (!assistant) {
      return res.status(404).json({
        message: "Assistant not found.",
      });
    }

    const token = createAssistantToken(assistant);

    return res.status(200).json({
      message: "Login successful",
      token,
      assistantName: assistant.name,
      assistantPhone: assistant.phonenumber,
    });
  } catch (error) {
    console.error("Assistant login error:", error);

    return res.status(500).json({
      message: "Server error while logging in assistant.",
    });
  }
});

/* -------------------------------------------------
   GET ASSIGNED ORDERS FOR ASSISTANT
------------------------------------------------- */

app.get(
  "/assistant-orders",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const orders = await Address.find({
        assistantId: req.user.assistantId,
      }).sort({ createdAt: -1 });

      return res.status(200).json(orders);
    } catch (error) {
      console.error("Get assistant orders error:", error);

      return res.status(500).json({
        message: "Failed to retrieve assistant orders.",
      });
    }
  }
);

/* -------------------------------------------------
   ASSISTANT ORDER STATUS UPDATE
------------------------------------------------- */

app.post(
  "/assistant_update",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const { orderId } = req.body;
      const status = normalizeStatus(req.body.status);

      const allowedStatuses = [
        "packed",
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
      ];

      if (
        !orderId ||
        !isValidObjectId(orderId) ||
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          message: "Invalid order ID or order status.",
        });
      }

      const order = await Address.findOne({
        _id: orderId,
        assistantId: req.user.assistantId,
      });

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found or it is not assigned to this assistant.",
        });
      }

      await OrderUpdate.create({
        assistantId: req.user.assistantId,
        orderId,
        status,
      });

      order.currentStatus = status;
      await order.save();

      return res.status(200).json({
        message: `Order status updated to ${status.replace(
          /_/g,
          " "
        )}.`,
        status,
      });
    } catch (error) {
      console.error("Assistant update error:", error);

      return res.status(500).json({
        message: "Error while updating order status.",
      });
    }
  }
);

/* -------------------------------------------------
   TRACK ORDER
------------------------------------------------- */

app.get(
  "/track-order/:orderId",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message: "Invalid order ID.",
        });
      }

      const order = await Address.findOne({
        _id: orderId,
        userId: req.user.userId,
      }).populate("assistantId", "name phonenumber");

      if (!order) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      const latestUpdate = await OrderUpdate.findOne({
        orderId,
      })
        .sort({ updatedAt: -1 })
        .populate("assistantId", "name phonenumber");

      return res.status(200).json({
        orderId: order._id,
        status:
          latestUpdate?.status ||
          order.currentStatus ||
          "assistant_assigned",
        assistant:
          latestUpdate?.assistantId?.name ||
          order.assistantId?.name ||
          "Assistant assigned",
        assistantPhone:
          latestUpdate?.assistantId?.phonenumber ||
          order.assistantId?.phonenumber,
        updatedAt:
          latestUpdate?.updatedAt ||
          order.updatedAt ||
          order.createdAt,
      });
    } catch (error) {
      console.error("Track order error:", error);

      return res.status(500).json({
        message: "Server error while tracking order.",
      });
    }
  }
);

/* -------------------------------------------------
   CONFIRM DELIVERY
------------------------------------------------- */

app.post(
  "/confirm-delivery",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const { orderId, status } = req.body;

      const validStatuses = [
        "received",
        "not_received",
        "problem_with_assistant",
      ];

      if (
        !orderId ||
        !isValidObjectId(orderId) ||
        !validStatuses.includes(status)
      ) {
        return res.status(400).json({
          message: "Invalid order ID or confirmation status.",
        });
      }

      const order = await Address.findOne({
        _id: orderId,
        userId: req.user.userId,
      });

      if (!order) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      await Confirmation.findOneAndUpdate(
        {
          userId: req.user.userId,
          orderId,
        },
        {
          status,
          confirmedAt: new Date(),
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

      if (status === "received") {
        order.currentStatus = "delivered";
        await order.save();
      }

      return res.status(200).json({
        message: `Delivery status updated to ${status.replace(
          /_/g,
          " "
        )}.`,
      });
    } catch (error) {
      console.error("Delivery confirmation error:", error);

      return res.status(500).json({
        message: "Server error while confirming delivery.",
      });
    }
  }
);

/* -------------------------------------------------
   SUBMIT ASSISTANT COMPLAINT
------------------------------------------------- */

app.post(
  "/submit-assistant-info",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      let { assistantNumber } = req.body;

      assistantNumber =
        assistantNumber?.replace(/[^\d]/g, "");

      if (!assistantNumber) {
        return res.status(400).json({
          message: "Assistant number is required.",
        });
      }

      if (!isValidPhone(assistantNumber)) {
        return res.status(400).json({
          message: "Enter a valid assistant number.",
        });
      }

      const assistant = await Assistant.findOne({
        phonenumber: assistantNumber,
      });

      if (!assistant) {
        return res.status(404).json({
          message: "Assistant not found.",
        });
      }

      await Complaint.create({
        assistantNumber,
        userId: req.user.userId,
      });

      return res.status(201).json({
        message:
          "Complaint submitted successfully. We will contact you shortly.",
      });
    } catch (error) {
      console.error("Complaint submission error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          message: "You have already reported this assistant.",
        });
      }

      return res.status(500).json({
        message: "Error while submitting complaint.",
      });
    }
  }
);

/* -------------------------------------------------
   404 HANDLER
------------------------------------------------- */

app.use((req, res) => {
  res.status(404).json({
    message: "Requested route was not found.",
  });
});

/* -------------------------------------------------
   GLOBAL ERROR HANDLER
------------------------------------------------- */

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  res.status(500).json({
    message: "An unexpected server error occurred.",
  });
});

/* -------------------------------------------------
   START SERVER
------------------------------------------------- */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🚀 Hakuna Express server running on port ${PORT}`
  );
});