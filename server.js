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
   SUBMIT COMPLAINT AGAINST ASSISTANT
------------------------------------------------- */

app.post(
  "/complaints",
  authMiddleware,
  userOnly,
  async (req, res) => {
    try {
      let {
        assistantNumber,
      } = req.body;

      assistantNumber =
        assistantNumber?.trim();

      if (!assistantNumber) {
        return res.status(400).json({
          message:
            "Assistant phone number is required.",
        });
      }

      if (!isValidPhone(assistantNumber)) {
        return res.status(400).json({
          message:
            "Please enter a valid assistant phone number.",
        });
      }

      const assistant =
        await Assistant.findOne({
          phonenumber:
            assistantNumber,
        });

      if (!assistant) {
        return res.status(404).json({
          message:
            "Assistant not found.",
        });
      }

      const existingComplaint =
        await Complaint.findOne({
          assistantNumber,
          userId: req.user.userId,
        });

      if (existingComplaint) {
        return res.status(409).json({
          message:
            "You have already submitted a complaint against this assistant.",
        });
      }

      const complaint =
        await Complaint.create({
          assistantNumber,
          userId: req.user.userId,
        });

      return res.status(201).json({
        message:
          "Complaint submitted successfully.",

        complaint: {
          id: complaint._id,
          assistantNumber:
            complaint.assistantNumber,
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
            "You have already submitted a complaint against this assistant.",
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
        }).sort({
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
   GET ASSISTANT COMPLAINT COUNT
------------------------------------------------- */

app.get(
  "/assistant/complaints",
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

      const complaints =
        await Complaint.find({
          assistantNumber:
            assistant.phonenumber,
        })
          .populate(
            "userId",
            "name username email"
          )
          .sort({
            submittedAt: -1,
          });

      return res.status(200).json({
        message:
          "Assistant complaints retrieved successfully.",

        complaintCount:
          complaints.length,

        complaints,
      });
    } catch (error) {
      console.error(
        "Get assistant complaints error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to retrieve assistant complaints.",
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