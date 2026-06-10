/**
 * TypeScript type definitions for Jianlian Shop
 *
 * These types define the data structures used throughout the application.
 * When integrating Supabase later, these types should be replaced with
 * types generated from the Supabase schema using `supabase gen types`.
 */

// Product categories available in the mall
export type ProductCategory =
  | "sim-cards"       // 国际电话卡
  | "gift-cards"      // 礼品卡
  | "digital-accounts" // 数字账号服务
  | "ai-membership"   // AI会员充值
  | "sms-code"        // 接码服务
  | "account-recharge"; // 账号充值

// Product delivery method
export type DeliveryMethod = "digital" | "physical" | "hybrid";

// Stock status for products
export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";

// Payment status for orders
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

// Processing status for orders
export type ProcessingStatus = "processing" | "completed" | "cancelled";

// Product type (physical SIM vs digital)
export type ProductType = "physical" | "digital";

// Listing status for admin product management
export type ListingStatus = "active" | "inactive";

// A single product in the mall
export interface Product {
  id: string;
  name: string;                          // 商品名称
  category: ProductCategory;             // 商品分类
  categoryLabel: string;                 // 分类中文名
  description: string;                   // 简短说明
  price: number;                         // 价格
  currency: string;                      // 货币单位
  stockStatus: StockStatus;              // 库存状态
  stockLabel: string;                    // 库存状态中文名
  processingTime: string;                // 处理时效
  deliveryMethod: DeliveryMethod;        // 交付方式
  deliveryLabel: string;                 // 交付方式中文名
  productType: ProductType;              // 商品类型 (物理/数字)
  listingStatus: ListingStatus;          // 上架状态
  detail?: string;                       // 商品详细说明
  purchaseNotes?: string;                // 购买须知
  faq?: ProductFAQ[];                    // 常见问题
}

// FAQ entry for a product
export interface ProductFAQ {
  question: string;
  answer: string;
}

// A single order
export interface Order {
  id: string;
  orderNo: string;                       // 订单号
  productName: string;                   // 商品名称
  productId: string;                     // 商品ID
  amount: number;                        // 订单金额
  paymentStatus: PaymentStatus;          // 支付状态
  paymentStatusLabel: string;            // 支付状态中文名
  processingStatus: ProcessingStatus;    // 处理状态
  processingStatusLabel: string;         // 处理状态中文名
  createdAt: string;                     // 创建时间
  contactInfo?: string;                  // 联系方式
  shippingInfo?: string;                 // 发货信息/处理备注
  productType: ProductType;              // 商品类型
}

// User profile (mock)
export interface UserProfile {
  id: string;
  phone: string;
  email: string;
  balance: number;                       // 当前余额
  orderCount: number;                    // 订单数量
  role: "guest" | "user" | "admin";      // 用户角色
  roleLabel: string;                     // 角色中文名
}

// Category definition
export interface Category {
  id: ProductCategory;
  name: string;                          // 中文名
  icon: string;                          // Lucide icon name
  href: string;                          // 链接路径
  description: string;                   // 分类描述
}

// Admin dashboard stats
export interface AdminStats {
  todayOrders: number;                   // 今日订单
  pendingPaymentOrders: number;          // 待付款订单
  pendingProcessingOrders: number;       // 待处理订单
  completedOrders: number;               // 已完成订单
  todayRevenue: number;                 // 今日销售额
}

// Admin order with extended fields
export interface AdminOrder extends Order {
  productType: ProductType;
  productCategory: ProductCategory;
  customerContact: string;               // 客户联系方式
  paymentMethod: string;                 // 支付方式
}

// Checkout form data for physical SIM card products
export interface PhysicalCheckoutData {
  recipientName: string;                 // 收货人姓名
  phoneNumber: string;                   // 手机号码
  shippingAddress: string;               // 详细收货地址
  orderNote: string;                     // 订单备注
}

// Checkout form data for digital products
export interface DigitalCheckoutData {
  contactInfo: string;                   // 联系方式
  email: string;                         // 邮箱
  accountRegion: string;                 // 账号地区
  orderNote: string;                     // 订单备注
}
