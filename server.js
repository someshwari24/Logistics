require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET;

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

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "❌ ADMIN_EMAIL and ADMIN_PASSWORD must be configured."
  );
  process.exit(1);
}

if (
  !RAZORPAY_KEY_ID ||
  !RAZORPAY_KEY_SECRET ||
  !RAZORPAY_WEBHOOK_SECRET
) {
  console.error(
    "❌ Razorpay environment variables are missing."
  );
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

/* -------------------------------------------------
   MIDDLEWARE
------------------------------------------------- */

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/* -------------------------------------------------
   RAZORPAY WEBHOOK
   This route must appear before express.json().
------------------------------------------------- */

app.post(
  "/razorpay/webhook",
  express.raw({
    type: "application/json",
  }),
  async (req, res) => {
    try {
      const webhookSignature =
        req.headers["x-razorpay-signature"];

      if (!webhookSignature) {
        return res.status(400).json({
          message:
            "Razorpay webhook signature is missing.",
        });
      }

      const expectedSignature = crypto
        .createHmac(
          "sha256",
          RAZORPAY_WEBHOOK_SECRET
        )
        .update(req.body)
        .digest("hex");

      const receivedBuffer =
        Buffer.from(webhookSignature);

      const expectedBuffer =
        Buffer.from(expectedSignature);

      if (
        receivedBuffer.length !==
          expectedBuffer.length ||
        !crypto.timingSafeEqual(
          receivedBuffer,
          expectedBuffer
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid Razorpay webhook signature.",
        });
      }

      const event = JSON.parse(
        req.body.toString("utf8")
      );

      const paymentEntity =
        event.payload?.payment?.entity;

      const razorpayOrderId =
        paymentEntity?.order_id;

      if (!razorpayOrderId) {
        return res.status(200).json({
          message:
            "Webhook received without an order ID.",
        });
      }

      const bill =
        await PaymentBill.findOne({
          razorpayOrderId,
        });

      if (!bill) {
        return res.status(200).json({
          message:
            "No local bill matched this Razorpay order.",
        });
      }

      if (
        event.event ===
          "payment.captured" ||
        event.event === "order.paid"
      ) {
        const expectedAmount =
          Math.round(
            bill.totalAmount * 100
          );

        if (
          Number(paymentEntity.amount) ===
            expectedAmount &&
          paymentEntity.currency === "INR"
        ) {
          bill.razorpayPaymentId =
            paymentEntity.id;

          bill.paymentGatewayStatus =
            paymentEntity.status;

          bill.billStatus = "paid";

          bill.paidAt =
            bill.paidAt || new Date();

          await bill.save();
        }
      }

      if (
        event.event ===
        "payment.failed"
      ) {
        bill.billStatus =
          "payment_failed";

        bill.paymentGatewayStatus =
          paymentEntity.status ||
          "failed";

        bill.failureReason =
          paymentEntity.error_description ||
          "Payment failed.";

        await bill.save();
      }

      return res.status(200).json({
        message:
          "Webhook processed successfully.",
      });
    } catch (error) {
      console.error(
        "Razorpay webhook error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to process Razorpay webhook.",
      });
    }
  }
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

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
      unique: true,
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

const Assistant = mongoose.model(
  "Assistant",
  assistantSchema
);

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

const Address = mongoose.model(
  "Address",
  addressSchema
);

/* -------------------------------------------------
   COMPLAINT SCHEMA
------------------------------------------------- */

const complaintSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },

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

    assistantNumber: {
      type: String,
      required: true,
      trim: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500,
    },

    status: {
      type: String,
      enum: [
        "open",
        "in_review",
        "resolved",
        "rejected",
      ],
      default: "open",
    },

    adminNote: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: "",
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "complaints",
    timestamps: true,
  }
);

complaintSchema.index(
  {
    orderId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

const Complaint = mongoose.model(
  "Complaint",
  complaintSchema
);
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
   PAYMENT BILL SCHEMA
------------------------------------------------- */

const paymentBillSchema =
  new mongoose.Schema(
    {
      orderId: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "Address",
        required: true,
        unique: true,
      },

      userId: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
      },

      assistantId: {
        type:
          mongoose.Schema.Types
            .ObjectId,
        ref: "Assistant",
        required: true,
      },

      itemAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      deliveryCharge: {
        type: Number,
        default: 0,
        min: 0,
      },

      taxAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      discountAmount: {
        type: Number,
        default: 0,
        min: 0,
      },

      totalAmount: {
        type: Number,
        required: true,
        min: 1,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },

      billStatus: {
        type: String,
        enum: [
          "generated",
          "payment_pending",
          "paid",
          "payment_failed",
          "admin_verified",
          "admin_rejected",
        ],
        default: "generated",
      },

      razorpayOrderId: {
        type: String,
        default: null,
      },

      razorpayPaymentId: {
        type: String,
        default: null,
      },

      razorpaySignature: {
        type: String,
        default: null,
      },

      paymentGatewayStatus: {
        type: String,
        default: null,
      },

      failureReason: {
        type: String,
        default: "",
      },

      paidAt: {
        type: Date,
        default: null,
      },

      adminVerifiedAt: {
        type: Date,
        default: null,
      },

      adminNote: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: "",
      },
    },
    {
      timestamps: true,
      collection: "payment_bills",
    }
  );

const PaymentBill =
  mongoose.model(
    "PaymentBill",
    paymentBillSchema
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

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
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

function createAdminToken() {
  return jwt.sign(
    {
      role: "admin",
      email: ADMIN_EMAIL,
    },
    JWT_SECRET,
    {
      expiresIn: "2h",
    }
  );
}

/* -------------------------------------------------
   AUTHENTICATION MIDDLEWARE
------------------------------------------------- */

function authMiddleware(req, res, next) {
  const authorization =
    req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      message:
        "Authentication token is missing.",
    });
  }

  const token =
    authorization.split(" ")[1];

  try {
    req.user = jwt.verify(
      token,
      JWT_SECRET
    );

    next();

  } catch (error) {
    return res.status(403).json({
      message:
        "Invalid or expired authentication token.",
    });
  }
}

function userOnly(req, res, next) {
  if (
    req.user.role !== "user" ||
    !req.user.userId
  ) {
    return res.status(403).json({
      message:
        "Only customers can perform this operation.",
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
      message:
        "Only assistants can perform this operation.",
    });
  }

  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message:
        "Only administrators can perform this operation.",
    });
  }

  next();
}

/* -------------------------------------------------
   BASIC ROUTES
------------------------------------------------- */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "home.html")
  );
});

app.get("/health", (req, res) => {
  res.status(200).json({
    message:
      "Hakuna Express server is running.",
  });
});

/* -------------------------------------------------
   USER SIGNUP
------------------------------------------------- */

app.post("/signup", async (req, res) => {
  try {
    let {
      name,
      username,
      email,
      password,
    } = req.body;

    name = name?.trim();
    username = username?.trim();
    email = email?.trim().toLowerCase();

    if (
      !name ||
      !username ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        message:
          "Name, username, email, and password are required.",
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        message:
          "Username must contain at least 3 characters.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message:
          "Please enter a valid email address.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must contain at least 6 characters.",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { username },
        { email },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        message:
          "A user with this username or email already exists.",
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      username,
      email,
      password: hashedPassword,
    });

    const token =
      createUserToken(user);

    return res.status(201).json({
      message:
        "Account created successfully.",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(
      "Signup error:",
      error
    );

    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "Username or email already exists.",
      });
    }

    return res.status(500).json({
      message:
        "Unable to create account.",
    });
  }
});

/* -------------------------------------------------
   USER LOGIN
------------------------------------------------- */

app.post("/login", async (req, res) => {
  try {
    let {
      username,
      email,
      password,
    } = req.body;

    username = username?.trim();
    email = email?.trim().toLowerCase();

    if (
      (!username && !email) ||
      !password
    ) {
      return res.status(400).json({
        message:
          "Username or email and password are required.",
      });
    }

    const user = await User.findOne(
      username
        ? { username }
        : { email }
    );

    if (!user) {
      return res.status(401).json({
        message:
          "Invalid login credentials.",
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatches) {
      return res.status(401).json({
        message:
          "Invalid login credentials.",
      });
    }

    const token =
      createUserToken(user);

    return res.status(200).json({
      message:
        "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to log in.",
    });
  }
});

/* -------------------------------------------------
   CURRENT USER DETAILS
------------------------------------------------- */

app.get(
  "/me",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const user = await User.findById(
        req.user.userId
      ).select("-password");

      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }

      return res.status(200).json({
        user,
      });
    } catch (error) {
      console.error(
        "Get user error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve user details.",
      });
    }
  }
);

/* -------------------------------------------------
   GET AVAILABLE ASSISTANTS

   Example:
   GET /assistants?city=Hyderabad&state=Telangana
------------------------------------------------- */

app.get(
  "/assistants",
  async (req, res) => {
    try {
      let {
        city,
        state,
      } = req.query;

      city = city?.trim();
      state = state?.trim();

      if (!city || !state) {
        return res.status(400).json({
          message:
            "City and state are required.",
          assistants: [],
        });
      }

      const assistants =
        await Assistant.find({
          city: {
            $regex: `^${escapeRegex(city)}$`,
            $options: "i",
          },

          state: {
            $regex: `^${escapeRegex(state)}$`,
            $options: "i",
          },

          isAvailable: true,
        })
          .select(
            "_id name phonenumber city state isAvailable"
          )
          .sort({
            name: 1,
          });

      return res.status(200).json({
        message:
          assistants.length > 0
            ? "Available assistants retrieved successfully."
            : "No available assistants found for this location.",
        assistants,
      });
    } catch (error) {
      console.error(
        "Get assistants error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve assistants.",
        assistants: [],
      });
    }
  }
);

/* -------------------------------------------------
   SUBMIT SHOPPING DETAILS

   Frontend must send:
   {
     name,
     address,
     city,
     state,
     assistantId,
     pincode,
     mobile,
     item,
     language,
     date,
     time
   }
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
        assistantId,
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
      assistantId =
        assistantId?.trim();
      pincode = pincode?.trim();
      mobile = mobile?.trim();
      item = item?.trim();
      language =
        language?.trim();
      date = date?.trim();
      time = time?.trim();

      if (
        !name ||
        !address ||
        !city ||
        !state ||
        !assistantId ||
        !pincode ||
        !mobile ||
        !item ||
        !language ||
        !date ||
        !time
      ) {
        return res.status(400).json({
          message:
            "All booking details, including the selected assistant, are required.",
        });
      }

      if (
        !isValidObjectId(
          assistantId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid assistant selection.",
        });
      }

      if (!isValidPhone(mobile)) {
        return res.status(400).json({
          message:
            "Mobile number must contain between 10 and 15 digits.",
        });
      }

      if (
        !/^[A-Za-z0-9 -]{4,10}$/.test(
          pincode
        )
      ) {
        return res.status(400).json({
          message:
            "Please enter a valid pincode.",
        });
      }

      const shoppingDate =
        new Date(
          `${date}T${time}`
        );

      if (
        Number.isNaN(
          shoppingDate.getTime()
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid shopping date or time.",
        });
      }

      if (
        shoppingDate.getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          message:
            "Shopping date and time must be in the future.",
        });
      }

      /*
       * Verify that the assistant selected by
       * the customer exists, is available, and
       * belongs to the entered city and state.
       */

      const assistant =
        await Assistant.findOne({
          _id: assistantId,

          city: {
            $regex: `^${escapeRegex(city)}$`,
            $options: "i",
          },

          state: {
            $regex: `^${escapeRegex(state)}$`,
            $options: "i",
          },

          isAvailable: true,
        });

      if (!assistant) {
        return res.status(404).json({
          message:
            "The selected assistant was not found or is no longer available.",
        });
      }

      const order =
        await Address.create({
          userId:
            req.user.userId,

          assistantId:
            assistant._id,

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

          currentStatus:
            "assistant_assigned",
        });

      const message = [
        "Hello",
        assistant.name,
        "",
        "A new shopping request has been assigned to you.",
        "",
        `Customer: ${name}`,
        `Address: ${address}`,
        `City: ${city}`,
        `State: ${state}`,
        `Pincode: ${pincode}`,
        `Mobile: ${mobile}`,
        `Items: ${item}`,
        `Preferred language: ${language}`,
        `Shopping date: ${date}`,
        `Shopping time: ${time}`,
        `Order ID: ${order._id}`,
      ].join("\n");

      const assistantPhone =
        assistant.phonenumber.replace(
          /\D/g,
          ""
        );

      const whatsappUrl =
        `https://wa.me/${assistantPhone}` +
        `?text=${encodeURIComponent(message)}`;

      return res.status(201).json({
        message:
          "Shopping request submitted successfully.",

        order: {
          id: order._id,
          name: order.name,
          address: order.address,
          city: order.city,
          state: order.state,
          pincode: order.pincode,
          mobile: order.mobile,
          item: order.item,
          language: order.language,
          shoppingDate:
            order.shoppingDate,
          shoppingTime:
            order.shoppingTime,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
        },

        assistant: {
          id: assistant._id,
          name: assistant.name,
          phonenumber:
            assistant.phonenumber,
          city: assistant.city,
          state: assistant.state,
        },

        whatsappUrl,
      });
    } catch (error) {
      console.error(
        "Submit details error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to submit shopping request.",
      });
    }
  }
);
/* -------------------------------------------------
   ASSISTANT LOGIN
------------------------------------------------- */

app.post(
  "/assistant-login",
  async (req, res) => {
    try {
      let {
        phonenumber,
      } = req.body;

      phonenumber =
        phonenumber?.trim();

      if (!phonenumber) {
        return res.status(400).json({
          message:
            "Phone number is required.",
        });
      }

      if (
        !isValidPhone(phonenumber)
      ) {
        return res.status(400).json({
          message:
            "Phone number must contain between 10 and 15 digits.",
        });
      }

      const assistant =
        await Assistant.findOne({
          phonenumber,
        });

      if (!assistant) {
        return res.status(401).json({
          message:
            "Assistant account not found.",
        });
      }

      const token =
        createAssistantToken(
          assistant
        );

      return res.status(200).json({
        message:
          "Assistant login successful.",

        token,

        assistant: {
          id: assistant._id,
          name: assistant.name,
          phonenumber:
            assistant.phonenumber,
          city: assistant.city,
          state: assistant.state,
          isAvailable:
            assistant.isAvailable,
        },
      });
    } catch (error) {
      console.error(
        "Assistant login error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to log in as assistant.",
      });
    }
  }
);

/* -------------------------------------------------
   CURRENT ASSISTANT DETAILS
------------------------------------------------- */

app.get(
  "/assistant/me",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const assistant =
        await Assistant.findById(
          req.user.assistantId
        );

      if (!assistant) {
        return res.status(404).json({
          message:
            "Assistant not found.",
        });
      }

      return res.status(200).json({
        assistant: {
          id: assistant._id,
          name: assistant.name,
          phonenumber:
            assistant.phonenumber,
          city: assistant.city,
          state: assistant.state,
          isAvailable:
            assistant.isAvailable,
          createdAt:
            assistant.createdAt,
        },
      });
    } catch (error) {
      console.error(
        "Get assistant profile error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve assistant details.",
      });
    }
  }
);

/* -------------------------------------------------
   UPDATE ASSISTANT AVAILABILITY
------------------------------------------------- */

app.patch(
  "/assistant/availability",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const {
        isAvailable,
      } = req.body;

      if (
        typeof isAvailable !==
        "boolean"
      ) {
        return res.status(400).json({
          message:
            "isAvailable must be either true or false.",
        });
      }

      const assistant =
        await Assistant.findByIdAndUpdate(
          req.user.assistantId,
          {
            isAvailable,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!assistant) {
        return res.status(404).json({
          message:
            "Assistant not found.",
        });
      }

      return res.status(200).json({
        message:
          "Availability updated successfully.",

        assistant: {
          id: assistant._id,
          name: assistant.name,
          phonenumber:
            assistant.phonenumber,
          city: assistant.city,
          state: assistant.state,
          isAvailable:
            assistant.isAvailable,
        },
      });
    } catch (error) {
      console.error(
        "Update assistant availability error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to update availability.",
      });
    }
  }
);

/* -------------------------------------------------
   GET CUSTOMER'S ORDERS
------------------------------------------------- */

app.get(
  "/my-orders",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const orders =
        await Address.find({
          userId:
            req.user.userId,
        })
          .populate(
            "assistantId",
            "name phonenumber city state"
          )
          .sort({
            createdAt: -1,
          });

      const formattedOrders =
        orders.map((order) => ({
          id: order._id,
          name: order.name,
          address: order.address,
          city: order.city,
          state: order.state,
          pincode: order.pincode,
          mobile: order.mobile,
          item: order.item,
          language: order.language,
          shoppingDate:
            order.shoppingDate,
          shoppingTime:
            order.shoppingTime,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
          updatedAt:
            order.updatedAt,

          assistant:
            order.assistantId
              ? {
                  id:
                    order
                      .assistantId
                      ._id,
                  name:
                    order
                      .assistantId
                      .name,
                  phonenumber:
                    order
                      .assistantId
                      .phonenumber,
                  city:
                    order
                      .assistantId
                      .city,
                  state:
                    order
                      .assistantId
                      .state,
                }
              : null,
        }));

      return res.status(200).json({
        message:
          "Orders retrieved successfully.",

        orders:
          formattedOrders,
      });
    } catch (error) {
      console.error(
        "Get customer orders error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve your orders.",
      });
    }
  }
);

/* -------------------------------------------------
   GET SINGLE CUSTOMER ORDER
------------------------------------------------- */

app.get(
  "/my-orders/:orderId",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const {
        orderId,
      } = req.params;

      if (
        !isValidObjectId(orderId)
      ) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const order =
        await Address.findOne({
          _id: orderId,
          userId:
            req.user.userId,
        }).populate(
          "assistantId",
          "name phonenumber city state"
        );

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found.",
        });
      }

      return res.status(200).json({
        order: {
          id: order._id,
          name: order.name,
          address: order.address,
          city: order.city,
          state: order.state,
          pincode: order.pincode,
          mobile: order.mobile,
          item: order.item,
          language: order.language,
          shoppingDate:
            order.shoppingDate,
          shoppingTime:
            order.shoppingTime,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
          updatedAt:
            order.updatedAt,

          assistant:
            order.assistantId
              ? {
                  id:
                    order
                      .assistantId
                      ._id,
                  name:
                    order
                      .assistantId
                      .name,
                  phonenumber:
                    order
                      .assistantId
                      .phonenumber,
                  city:
                    order
                      .assistantId
                      .city,
                  state:
                    order
                      .assistantId
                      .state,
                }
              : null,
        },
      });
    } catch (error) {
      console.error(
        "Get customer order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve the order.",
      });
    }
  }
);

/* -------------------------------------------------
   GET ALL ORDERS ASSIGNED TO ASSISTANT
------------------------------------------------- */

app.get(
  "/assistant/orders",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const orders =
        await Address.find({
          assistantId:
            req.user.assistantId,
        })
          .populate(
            "userId",
            "name username email"
          )
          .sort({
            createdAt: -1,
          });

      const formattedOrders =
        orders.map((order) => ({
          id: order._id,
          customer: order.userId
            ? {
                id:
                  order.userId._id,
                name:
                  order.userId.name,
                username:
                  order.userId
                    .username,
                email:
                  order.userId.email,
              }
            : null,

          deliveryName:
            order.name,
          address:
            order.address,
          city:
            order.city,
          state:
            order.state,
          pincode:
            order.pincode,
          mobile:
            order.mobile,
          item:
            order.item,
          language:
            order.language,
          shoppingDate:
            order.shoppingDate,
          shoppingTime:
            order.shoppingTime,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
          updatedAt:
            order.updatedAt,
        }));

      return res.status(200).json({
        message:
          "Assigned orders retrieved successfully.",

        orders:
          formattedOrders,
      });
    } catch (error) {
      console.error(
        "Get assistant orders error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve assigned orders.",
      });
    }
  }
);

/* -------------------------------------------------
   GET SINGLE ORDER ASSIGNED TO ASSISTANT
------------------------------------------------- */

app.get(
  "/assistant/orders/:orderId",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const {
        orderId,
      } = req.params;

      if (
        !isValidObjectId(orderId)
      ) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const order =
        await Address.findOne({
          _id: orderId,
          assistantId:
            req.user.assistantId,
        }).populate(
          "userId",
          "name username email"
        );

      if (!order) {
        return res.status(404).json({
          message:
            "Assigned order not found.",
        });
      }

      return res.status(200).json({
        order: {
          id: order._id,

          customer:
            order.userId
              ? {
                  id:
                    order.userId
                      ._id,
                  name:
                    order.userId
                      .name,
                  username:
                    order.userId
                      .username,
                  email:
                    order.userId
                      .email,
                }
              : null,

          deliveryName:
            order.name,
          address:
            order.address,
          city:
            order.city,
          state:
            order.state,
          pincode:
            order.pincode,
          mobile:
            order.mobile,
          item:
            order.item,
          language:
            order.language,
          shoppingDate:
            order.shoppingDate,
          shoppingTime:
            order.shoppingTime,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
          updatedAt:
            order.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        "Get assistant order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve the assigned order.",
      });
    }
  }
);
/* -------------------------------------------------
   UPDATE ORDER STATUS BY ASSISTANT
------------------------------------------------- */

app.patch(
  "/assistant/orders/:orderId/status",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      let { status } = req.body;

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message: "Invalid order ID.",
        });
      }

      status = normalizeStatus(status);

      const allowedStatuses = [
        "packed",
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid status. Allowed statuses are packed, shipped, in_transit, out_for_delivery, delivered, returned, and cancelled.",
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

      order.currentStatus = status;

      await order.save();

      const orderUpdate =
        await OrderUpdate.create({
          assistantId:
            req.user.assistantId,
          orderId: order._id,
          status,
        });

      return res.status(200).json({
        message:
          "Order status updated successfully.",

        order: {
          id: order._id,
          currentStatus:
            order.currentStatus,
          updatedAt: order.updatedAt,
        },

        update: {
          id: orderUpdate._id,
          status:
            orderUpdate.status,
          updatedAt:
            orderUpdate.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        "Update order status error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to update order status.",
      });
    }
  }
);

/* -------------------------------------------------
   CUSTOMER ORDER TRACKING
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
      }).populate(
        "assistantId",
        "name phonenumber city state"
      );

      if (!order) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      const updates =
        await OrderUpdate.find({
          orderId: order._id,
        })
          .sort({
            updatedAt: 1,
          })
          .select(
            "status updatedAt"
          );

      const timeline = [
        {
          status:
            "assistant_assigned",
          updatedAt:
            order.createdAt,
        },
        ...updates.map(
          (update) => ({
            status:
              update.status,
            updatedAt:
              update.updatedAt,
          })
        ),
      ];

      return res.status(200).json({
        message:
          "Order tracking details retrieved successfully.",

        order: {
          id: order._id,
          item: order.item,
          shoppingDate:
            order.shoppingDate,
          shoppingTime:
            order.shoppingTime,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
          updatedAt:
            order.updatedAt,

          assistant:
            order.assistantId
              ? {
                  id:
                    order
                      .assistantId
                      ._id,
                  name:
                    order
                      .assistantId
                      .name,
                  phonenumber:
                    order
                      .assistantId
                      .phonenumber,
                  city:
                    order
                      .assistantId
                      .city,
                  state:
                    order
                      .assistantId
                      .state,
                }
              : null,
        },

        timeline,
      });
    } catch (error) {
      console.error(
        "Track order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve order tracking details.",
      });
    }
  }
);

/* -------------------------------------------------
   ASSISTANT ORDER UPDATE HISTORY
------------------------------------------------- */

app.get(
  "/assistant/orders/:orderId/updates",
  authMiddleware,
  assistantOnly,
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
        assistantId:
          req.user.assistantId,
      }).select(
        "_id currentStatus createdAt updatedAt"
      );

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found or it is not assigned to this assistant.",
        });
      }

      const updates =
        await OrderUpdate.find({
          orderId: order._id,
          assistantId:
            req.user.assistantId,
        })
          .sort({
            updatedAt: 1,
          })
          .select(
            "status updatedAt"
          );

      return res.status(200).json({
        message:
          "Order update history retrieved successfully.",

        order: {
          id: order._id,
          currentStatus:
            order.currentStatus,
          createdAt:
            order.createdAt,
          updatedAt:
            order.updatedAt,
        },

        updates,
      });
    } catch (error) {
      console.error(
        "Get order updates error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve order updates.",
      });
    }
  }
);

/* -------------------------------------------------
   CUSTOMER CANCEL ORDER

   Cancellation is allowed only before delivery
   processing reaches shipped status.
------------------------------------------------- */

app.patch(
  "/my-orders/:orderId/cancel",
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
      });

      if (!order) {
        return res.status(404).json({
          message: "Order not found.",
        });
      }

      const nonCancellableStatuses = [
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
      ];

      if (
        nonCancellableStatuses.includes(
          order.currentStatus
        )
      ) {
        return res.status(400).json({
          message:
            "This order can no longer be cancelled.",
        });
      }

      order.currentStatus =
        "cancelled";

      await order.save();

      await OrderUpdate.create({
        assistantId:
          order.assistantId,
        orderId: order._id,
        status: "cancelled",
      });

      return res.status(200).json({
        message:
          "Order cancelled successfully.",

        order: {
          id: order._id,
          currentStatus:
            order.currentStatus,
          updatedAt:
            order.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        "Cancel order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to cancel the order.",
      });
    }
  }
);
/* -------------------------------------------------
   CUSTOMER DELIVERY CONFIRMATION
------------------------------------------------- */

app.post(
  "/confirm-delivery",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      let {
        orderId,
        status,
      } = req.body;

      orderId = orderId?.trim();
      status = status?.trim();

      if (!orderId || !status) {
        return res.status(400).json({
          message:
            "Order ID and confirmation status are required.",
        });
      }

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const allowedStatuses = [
        "received",
        "not_received",
        "problem_with_assistant",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid confirmation status.",
        });
      }

      const order = await Address.findOne({
        _id: orderId,
        userId: req.user.userId,
      });

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found.",
        });
      }

      const existingConfirmation =
        await Confirmation.findOne({
          userId: req.user.userId,
          orderId: order._id,
        });

      if (existingConfirmation) {
        return res.status(409).json({
          message:
            "Delivery confirmation has already been submitted for this order.",
        });
      }

      const confirmation =
        await Confirmation.create({
          userId: req.user.userId,
          orderId: order._id,
          status,
        });

      return res.status(201).json({
        message:
          "Delivery confirmation submitted successfully.",

        confirmation: {
          id: confirmation._id,
          orderId:
            confirmation.orderId,
          status:
            confirmation.status,
          confirmedAt:
            confirmation.confirmedAt,
        },
      });
    } catch (error) {
      console.error(
        "Confirm delivery error:",
        error
      );

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "Delivery confirmation has already been submitted.",
        });
      }

      return res.status(500).json({
        message:
          "Unable to submit delivery confirmation.",
      });
    }
  }
);

/* -------------------------------------------------
   GET CUSTOMER DELIVERY CONFIRMATIONS
------------------------------------------------- */

app.get(
  "/my-confirmations",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const confirmations =
        await Confirmation.find({
          userId: req.user.userId,
        })
          .populate(
            "orderId",
            "item currentStatus shoppingDate shoppingTime"
          )
          .sort({
            confirmedAt: -1,
          });

      return res.status(200).json({
        message:
          "Delivery confirmations retrieved successfully.",
        confirmations,
      });
    } catch (error) {
      console.error(
        "Get confirmations error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve delivery confirmations.",
      });
    }
  }
);

/* -------------------------------------------------
   USER SUBMITS COMPLAINT FOR AN ORDER
------------------------------------------------- */

app.post(
  "/complaints",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      let {
        orderId,
        reason,
        description,
      } = req.body;

      orderId = orderId?.trim();
      reason = reason?.trim();
      description = description?.trim();

      if (!orderId || !reason || !description) {
        return res.status(400).json({
          message:
            "Order ID, reason, and description are required.",
        });
      }

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const order = await Address.findOne({
        _id: orderId,
        userId: req.user.userId,
      }).populate(
        "assistantId",
        "name phonenumber city state"
      );

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found or it does not belong to you.",
        });
      }

      if (!order.assistantId) {
        return res.status(400).json({
          message:
            "This order does not have an assigned assistant.",
        });
      }

      const existingComplaint =
        await Complaint.findOne({
          orderId: order._id,
          userId: req.user.userId,
        });

      if (existingComplaint) {
        return res.status(409).json({
          message:
            "You have already submitted a complaint for this order.",
        });
      }

      const complaint =
        await Complaint.create({
          orderId: order._id,
          userId: req.user.userId,
          assistantId:
            order.assistantId._id,
          assistantNumber:
            order.assistantId.phonenumber,
          reason,
          description,
        });

      return res.status(201).json({
        message:
          "Complaint submitted successfully.",

        complaint: {
          id: complaint._id,
          orderId: complaint.orderId,
          assistantId:
            complaint.assistantId,
          assistantNumber:
            complaint.assistantNumber,
          reason: complaint.reason,
          description:
            complaint.description,
          status: complaint.status,
          submittedAt:
            complaint.submittedAt,
        },
      });
    } catch (error) {
      console.error(
        "Complaint error:",
        error
      );

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "You have already submitted a complaint for this order.",
        });
      }

      return res.status(500).json({
        message:
          "Unable to submit complaint.",
      });
    }
  }
);

/* -------------------------------------------------
   GET CUSTOMER COMPLAINTS
------------------------------------------------- */

app.get(
  "/my-complaints",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const complaints =
        await Complaint.find({
          userId: req.user.userId,
        })
          .populate(
            "orderId",
            "item currentStatus shoppingDate shoppingTime address city state pincode mobile"
          )
          .populate(
            "assistantId",
            "name phonenumber city state"
          )
          .sort({
            submittedAt: -1,
          });

      return res.status(200).json({
        message:
          "Complaints retrieved successfully.",
        complaints,
      });
    } catch (error) {
      console.error(
        "Get complaints error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve complaints.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN LOGIN
------------------------------------------------- */

app.post(
  "/admin-login",
  async (req, res) => {
    try {
      let { email, password } = req.body;

      email = email?.trim().toLowerCase();

      if (!email || !password) {
        return res.status(400).json({
          message:
            "Admin email and password are required.",
        });
      }

      if (
        email !== ADMIN_EMAIL.toLowerCase() ||
        password !== ADMIN_PASSWORD
      ) {
        return res.status(401).json({
          message:
            "Invalid administrator credentials.",
        });
      }

      const token = createAdminToken();

      return res.status(200).json({
        message:
          "Administrator login successful.",
        token,
        admin: {
          email: ADMIN_EMAIL,
        },
      });
    } catch (error) {
      console.error(
        "Admin login error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to log in as administrator.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN GET ALL ASSISTANTS
------------------------------------------------- */

app.get(
  "/admin/assistants",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const assistants =
        await Assistant.find()
          .sort({ createdAt: -1 });

      return res.status(200).json({
        assistants,
      });
    } catch (error) {
      console.error(
        "Admin get assistants error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve assistants.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN ADDS ASSISTANT
------------------------------------------------- */

app.post(
  "/admin/assistants",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      let {
        name,
        phonenumber,
        city,
        state,
      } = req.body;

      name = name?.trim();
      phonenumber =
        phonenumber?.replace(/\D/g, "");
      city = city?.trim();
      state = state?.trim();

      if (
        !name ||
        !phonenumber ||
        !city ||
        !state
      ) {
        return res.status(400).json({
          message:
            "Name, phone number, city, and state are required.",
        });
      }

      if (!isValidPhone(phonenumber)) {
        return res.status(400).json({
          message:
            "Phone number must contain between 10 and 15 digits.",
        });
      }

      const assistant =
        await Assistant.create({
          name,
          phonenumber,
          city,
          state,
          isAvailable: true,
        });

      return res.status(201).json({
        message:
          "Assistant added successfully.",
        assistant,
      });
    } catch (error) {
      console.error(
        "Admin add assistant error:",
        error
      );

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "An assistant with this phone number already exists.",
        });
      }

      return res.status(500).json({
        message:
          "Unable to add assistant.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN UPDATES ASSISTANT AVAILABILITY
------------------------------------------------- */

app.patch(
  "/admin/assistants/:assistantId/availability",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const { assistantId } = req.params;
      const { isAvailable } = req.body;

      if (!isValidObjectId(assistantId)) {
        return res.status(400).json({
          message:
            "Invalid assistant ID.",
        });
      }

      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({
          message:
            "isAvailable must be true or false.",
        });
      }

      const assistant =
        await Assistant.findByIdAndUpdate(
          assistantId,
          { isAvailable },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!assistant) {
        return res.status(404).json({
          message:
            "Assistant not found.",
        });
      }

      return res.status(200).json({
        message:
          "Assistant availability updated.",
        assistant,
      });
    } catch (error) {
      console.error(
        "Admin update assistant error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to update assistant.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN DELETES ASSISTANT
------------------------------------------------- */

app.delete(
  "/admin/assistants/:assistantId",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const { assistantId } = req.params;

      if (!isValidObjectId(assistantId)) {
        return res.status(400).json({
          message:
            "Invalid assistant ID.",
        });
      }

      const assignedOrderCount =
        await Address.countDocuments({
          assistantId,
        });

      if (assignedOrderCount > 0) {
        return res.status(400).json({
          message:
            "This assistant has assigned orders. Mark the assistant unavailable instead of deleting.",
        });
      }

      const assistant =
        await Assistant.findByIdAndDelete(
          assistantId
        );

      if (!assistant) {
        return res.status(404).json({
          message:
            "Assistant not found.",
        });
      }

      return res.status(200).json({
        message:
          "Assistant deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Admin delete assistant error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to delete assistant.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN GETS ALL COMPLAINTS WITH RELATED DETAILS
------------------------------------------------- */

app.get(
  "/admin/complaints",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const complaints =
        await Complaint.find()
          .populate(
            "userId",
            "name username email"
          )
          .populate(
            "assistantId",
            "name phonenumber city state isAvailable"
          )
          .populate(
            "orderId",
            "name address city state pincode shoppingDate shoppingTime item mobile language currentStatus createdAt updatedAt"
          )
          .sort({
            submittedAt: -1,
          });

      return res.status(200).json({
        complaints,
      });
    } catch (error) {
      console.error(
        "Admin get complaints error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve complaints.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN UPDATES COMPLAINT STATUS
------------------------------------------------- */

app.patch(
  "/admin/complaints/:complaintId",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const { complaintId } = req.params;
      let { status, adminNote } = req.body;

      if (!isValidObjectId(complaintId)) {
        return res.status(400).json({
          message:
            "Invalid complaint ID.",
        });
      }

      status = status?.trim();
      adminNote = adminNote?.trim() || "";

      const allowedStatuses = [
        "open",
        "in_review",
        "resolved",
        "rejected",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Invalid complaint status.",
        });
      }

      const update = {
        status,
        adminNote,
        resolvedAt:
          status === "resolved" ||
          status === "rejected"
            ? new Date()
            : null,
      };

      const complaint =
        await Complaint.findByIdAndUpdate(
          complaintId,
          update,
          {
            new: true,
            runValidators: true,
          }
        );

      if (!complaint) {
        return res.status(404).json({
          message:
            "Complaint not found.",
        });
      }

      return res.status(200).json({
        message:
          "Complaint updated successfully.",
        complaint,
      });
    } catch (error) {
      console.error(
        "Admin update complaint error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to update complaint.",
      });
    }
  }
);

/* -------------------------------------------------
   ASSISTANT CREATES OR UPDATES A BILL
------------------------------------------------- */

app.post(
  "/assistant/orders/:orderId/bill",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      let {
        itemAmount,
        deliveryCharge = 0,
        taxAmount = 0,
        discountAmount = 0,
        description = "",
      } = req.body;

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const order =
        await Address.findOne({
          _id: orderId,
          assistantId:
            req.user.assistantId,
        });

      if (!order) {
        return res.status(404).json({
          message:
            "Assigned order not found.",
        });
      }

      itemAmount =
        Number(itemAmount);

      deliveryCharge =
        Number(deliveryCharge);

      taxAmount =
        Number(taxAmount);

      discountAmount =
        Number(discountAmount);

      const amounts = [
        itemAmount,
        deliveryCharge,
        taxAmount,
        discountAmount,
      ];

      if (
        amounts.some(
          (value) =>
            !Number.isFinite(value) ||
            value < 0
        )
      ) {
        return res.status(400).json({
          message:
            "Enter valid non-negative bill amounts.",
        });
      }

      const totalAmount =
        itemAmount +
        deliveryCharge +
        taxAmount -
        discountAmount;

      if (totalAmount <= 0) {
        return res.status(400).json({
          message:
            "Total bill amount must be greater than zero.",
        });
      }

      const existingBill =
        await PaymentBill.findOne({
          orderId,
        });

      if (
        existingBill &&
        [
          "paid",
          "admin_verified",
        ].includes(
          existingBill.billStatus
        )
      ) {
        return res.status(400).json({
          message:
            "A paid bill cannot be changed.",
        });
      }

      const bill =
        await PaymentBill.findOneAndUpdate(
          {
            orderId,
          },
          {
            orderId,
            userId: order.userId,
            assistantId:
              req.user.assistantId,
            itemAmount,
            deliveryCharge,
            taxAmount,
            discountAmount,
            totalAmount,
            description:
              description?.trim() || "",
            billStatus: "generated",
            razorpayOrderId: null,
            razorpayPaymentId: null,
            razorpaySignature: null,
            paymentGatewayStatus:
              null,
            failureReason: "",
            paidAt: null,
            adminVerifiedAt: null,
            adminNote: "",
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        );

      return res.status(201).json({
        message:
          "Payment bill generated successfully.",
        bill,
      });
    } catch (error) {
      console.error(
        "Create bill error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to generate payment bill.",
      });
    }
  }
);

/* -------------------------------------------------
   ASSISTANT VIEWS A BILL
------------------------------------------------- */

app.get(
  "/assistant/orders/:orderId/bill",
  authMiddleware,
  assistantOnly,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const bill =
        await PaymentBill.findOne({
          orderId,
          assistantId:
            req.user.assistantId,
        })
          .populate(
            "userId",
            "name username email"
          )
          .populate(
            "orderId",
            "item currentStatus address city state pincode mobile"
          );

      if (!bill) {
        return res.status(404).json({
          message:
            "Payment bill not found.",
        });
      }

      return res.status(200).json({
        bill,
      });
    } catch (error) {
      console.error(
        "Assistant get bill error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve payment bill.",
      });
    }
  }
);

/* -------------------------------------------------
   USER VIEWS A BILL
------------------------------------------------- */

app.get(
  "/my-orders/:orderId/bill",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const bill =
        await PaymentBill.findOne({
          orderId,
          userId: req.user.userId,
        })
          .populate(
            "assistantId",
            "name phonenumber"
          )
          .populate(
            "orderId",
            "item currentStatus address city state pincode"
          );

      if (!bill) {
        return res.status(404).json({
          message:
            "Payment bill not found.",
        });
      }

      return res.status(200).json({
        bill,
        razorpayKeyId:
          RAZORPAY_KEY_ID,
      });
    } catch (error) {
      console.error(
        "User get bill error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve payment bill.",
      });
    }
  }
);

/* -------------------------------------------------
   USER CREATES A RAZORPAY ORDER
------------------------------------------------- */

app.post(
  "/my-orders/:orderId/create-payment",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const { orderId } = req.params;

      if (!isValidObjectId(orderId)) {
        return res.status(400).json({
          message:
            "Invalid order ID.",
        });
      }

      const bill =
        await PaymentBill.findOne({
          orderId,
          userId: req.user.userId,
        });

      if (!bill) {
        return res.status(404).json({
          message:
            "Payment bill not found.",
        });
      }

      if (
        [
          "paid",
          "admin_verified",
        ].includes(
          bill.billStatus
        )
      ) {
        return res.status(400).json({
          message:
            "This bill has already been paid.",
        });
      }

      const amountInPaise =
        Math.round(
          bill.totalAmount * 100
        );

      if (amountInPaise < 100) {
        return res.status(400).json({
          message:
            "The payment amount must be at least ₹1.",
        });
      }

      const razorpayOrder =
        await razorpay.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt:
            `bill_${bill._id}`,
          notes: {
            billId:
              bill._id.toString(),
            deliveryOrderId:
              orderId,
            userId:
              req.user.userId,
          },
        });

      bill.razorpayOrderId =
        razorpayOrder.id;

      bill.razorpayPaymentId =
        null;

      bill.razorpaySignature =
        null;

      bill.paymentGatewayStatus =
        razorpayOrder.status;

      bill.billStatus =
        "payment_pending";

      bill.failureReason = "";

      await bill.save();

      return res.status(200).json({
        message:
          "Razorpay payment order created.",
        razorpayOrderId:
          razorpayOrder.id,
        amount:
          razorpayOrder.amount,
        currency:
          razorpayOrder.currency,
        keyId:
          RAZORPAY_KEY_ID,
        billId: bill._id,
      });
    } catch (error) {
      console.error(
        "Create Razorpay order error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to start payment.",
      });
    }
  }
);

/* -------------------------------------------------
   USER VERIFIES RAZORPAY PAYMENT
------------------------------------------------- */

app.post(
  "/payments/verify",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = req.body;

      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {
        return res.status(400).json({
          message:
            "Payment verification details are missing.",
        });
      }

      const bill =
        await PaymentBill.findOne({
          razorpayOrderId:
            razorpay_order_id,
          userId:
            req.user.userId,
        });

      if (!bill) {
        return res.status(404).json({
          message:
            "Payment bill not found.",
        });
      }

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            RAZORPAY_KEY_SECRET
          )
          .update(
            `${bill.razorpayOrderId}|${razorpay_payment_id}`
          )
          .digest("hex");

      const receivedBuffer =
        Buffer.from(
          razorpay_signature
        );

      const expectedBuffer =
        Buffer.from(
          expectedSignature
        );

      const isValid =
        receivedBuffer.length ===
          expectedBuffer.length &&
        crypto.timingSafeEqual(
          receivedBuffer,
          expectedBuffer
        );

      if (!isValid) {
        bill.billStatus =
          "payment_failed";

        bill.failureReason =
          "Payment signature verification failed.";

        await bill.save();

        return res.status(400).json({
          message:
            "Payment signature verification failed.",
        });
      }

      const payment =
        await razorpay.payments.fetch(
          razorpay_payment_id
        );

      const expectedAmount =
        Math.round(
          bill.totalAmount * 100
        );

      if (
        payment.order_id !==
          bill.razorpayOrderId ||
        Number(payment.amount) !==
          expectedAmount ||
        payment.currency !== "INR"
      ) {
        return res.status(400).json({
          message:
            "Payment details do not match the bill.",
        });
      }

      if (
        payment.status !== "captured"
      ) {
        bill.paymentGatewayStatus =
          payment.status;

        await bill.save();

        return res.status(400).json({
          message:
            `Payment is ${payment.status}, not captured.`,
        });
      }

      bill.razorpayPaymentId =
        razorpay_payment_id;

      bill.razorpaySignature =
        razorpay_signature;

      bill.paymentGatewayStatus =
        payment.status;

      bill.billStatus = "paid";

      bill.paidAt =
        bill.paidAt || new Date();

      bill.failureReason = "";

      await bill.save();

      return res.status(200).json({
        message:
          "Payment verified successfully.",
        bill,
      });
    } catch (error) {
      console.error(
        "Verify payment error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to verify payment.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN VIEWS ALL PAYMENT BILLS
------------------------------------------------- */

app.get(
  "/admin/payments",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const bills =
        await PaymentBill.find()
          .populate(
            "userId",
            "name username email"
          )
          .populate(
            "assistantId",
            "name phonenumber city state isAvailable"
          )
          .populate(
            "orderId",
            "item currentStatus address city state pincode mobile shoppingDate shoppingTime"
          )
          .sort({
            createdAt: -1,
          });

      return res.status(200).json({
        bills,
      });
    } catch (error) {
      console.error(
        "Admin get payments error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve payments.",
      });
    }
  }
);

/* -------------------------------------------------
   ADMIN VERIFIES OR REJECTS A PAYMENT
------------------------------------------------- */

app.patch(
  "/admin/payments/:billId/verify",
  authMiddleware,
  adminOnly,
  async (req, res) => {
    try {
      const { billId } = req.params;

      const {
        approved,
        adminNote = "",
      } = req.body;

      if (!isValidObjectId(billId)) {
        return res.status(400).json({
          message:
            "Invalid bill ID.",
        });
      }

      if (
        typeof approved !==
        "boolean"
      ) {
        return res.status(400).json({
          message:
            "approved must be true or false.",
        });
      }

      const bill =
        await PaymentBill.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          message:
            "Payment bill not found.",
        });
      }

      if (approved) {
        if (
          bill.billStatus !== "paid"
        ) {
          return res.status(400).json({
            message:
              "Only a Razorpay-verified paid bill can be approved.",
          });
        }

        if (
          !bill.razorpayPaymentId
        ) {
          return res.status(400).json({
            message:
              "The Razorpay payment ID is missing.",
          });
        }

        const payment =
          await razorpay.payments.fetch(
            bill.razorpayPaymentId
          );

        const expectedAmount =
          Math.round(
            bill.totalAmount * 100
          );

        if (
          payment.status !==
            "captured" ||
          Number(payment.amount) !==
            expectedAmount ||
          payment.order_id !==
            bill.razorpayOrderId
        ) {
          return res.status(400).json({
            message:
              "Razorpay does not show a matching captured payment.",
          });
        }

        bill.billStatus =
          "admin_verified";
      } else {
        bill.billStatus =
          "admin_rejected";
      }

      bill.adminNote =
        adminNote?.trim() || "";

      bill.adminVerifiedAt =
        new Date();

      await bill.save();

      return res.status(200).json({
        message: approved
          ? "Payment approved by admin."
          : "Payment rejected by admin.",
        bill,
      });
    } catch (error) {
      console.error(
        "Admin payment verification error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to update payment verification.",
      });
    }
  }
);

/* -------------------------------------------------
   NOT FOUND HANDLER
------------------------------------------------- */

app.use((req, res) => {
  return res.status(404).json({
    message:
      `Route ${req.method} ${req.originalUrl} was not found.`,
  });
});

/* -------------------------------------------------
   GLOBAL ERROR HANDLER
------------------------------------------------- */

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      message:
        "An unexpected server error occurred.",
    });
  }
);

/* -------------------------------------------------
   SERVER STARTUP
------------------------------------------------- */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Hakuna Express server started on port ${PORT}`
  );
});
