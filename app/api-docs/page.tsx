import type { Metadata } from "next";
import ApiDocsClient from "@/components/docs/ApiDocsClient";

export const metadata: Metadata = {
  title: "供货 API 开发文档 - Jianlian",
  description:
    "Jianlian 开放平台统一供货 API 开发文档，支持通用 REST API、独角兽（Dujiao-Next）原生协议与异次元（AcgFaka）卡网对接。",
};

export default function ApiDocsPage() {
  return <ApiDocsClient />;
}
