export const openApiDocument = {
  openapi: "3.0.3",

  info: {
    title: "Foody Restaurant Marketplace API",
    version: "0.1.0",
    description:
      "REST API for the Foody restaurant marketplace.",
  },

  servers: [
    {
      url: "/",
      description: "Current server",
    },
  ],

  tags: [
    {
      name: "Authentication",
      description: "User registration, login, and identity.",
    },
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },

    schemas: {
      PublicUser: {
        type: "object",
        required: [
          "id",
          "name",
          "email",
          "role",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: {
            type: "string",
            format: "uuid",
          },
          name: {
            type: "string",
            example: "Sidiq Kusumah",
          },
          email: {
            type: "string",
            format: "email",
            example: "sidiq@example.com",
          },
          role: {
            type: "string",
            enum: [
              "CUSTOMER",
              "RESTAURANT_OWNER",
              "RESTAURANT_STAFF",
              "ADMIN",
            ],
            example: "CUSTOMER",
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },

      AuthData: {
        type: "object",
        required: ["user", "accessToken"],
        properties: {
          user: {
            $ref: "#/components/schemas/PublicUser",
          },
          accessToken: {
            type: "string",
            description: "Short-lived JWT access token.",
          },
        },
      },

      AuthSuccess: {
        type: "object",
        required: ["success", "message", "data"],
        properties: {
          success: {
            type: "boolean",
            enum: [true],
          },
          message: {
            type: "string",
          },
          data: {
            $ref: "#/components/schemas/AuthData",
          },
        },
      },

      ProfileSuccess: {
        type: "object",
        required: ["success", "message", "data"],
        properties: {
          success: {
            type: "boolean",
            enum: [true],
          },
          message: {
            type: "string",
            example: "Profile retrieved",
          },
          data: {
            $ref: "#/components/schemas/PublicUser",
          },
        },
      },

      ErrorResponse: {
        type: "object",
        required: ["success", "message"],
        properties: {
          success: {
            type: "boolean",
            enum: [false],
          },
          message: {
            type: "string",
          },
        },
      },
    },
  },

  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a customer account",
        operationId: "register",

        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["name", "email", "password"],
                properties: {
                  name: {
                    type: "string",
                    minLength: 1,
                    maxLength: 100,
                  },
                  email: {
                    type: "string",
                    format: "email",
                    maxLength: 254,
                  },
                  password: {
                    type: "string",
                    format: "password",
                    minLength: 15,
                    maxLength: 128,
                  },
                },
              },
            },
          },
        },

        responses: {
          "201": {
            description: "Registration successful",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSuccess",
                },
              },
            },
          },

          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },

          "409": {
            description: "Email is already registered",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login",
        operationId: "login",

        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["email", "password"],
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    maxLength: 254,
                  },
                  password: {
                    type: "string",
                    format: "password",
                    minLength: 15,
                    maxLength: 128,
                  },
                },
              },
            },
          },
        },

        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSuccess",
                },
              },
            },
          },

          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },

          "401": {
            description: "Invalid email or password",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },

    "/api/auth/profile": {
      get: {
        tags: ["Authentication"],
        summary: "Get authenticated user profile",
        operationId: "getProfile",
        security: [
          {
            bearerAuth: [],
          },
        ],

        responses: {
          "200": {
            description: "Profile retrieved",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProfileSuccess",
                },
              },
            },
          },

          "401": {
            description: "Authentication required",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
