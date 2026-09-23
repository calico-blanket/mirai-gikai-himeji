import { easyTextParts } from "../lib/easy-text";
export default function EasyText({ text }: { text: string }) {
  return <>{easyTextParts(text).map((part,index) => part.reading ? <ruby key={index}>{part.text}<rp>（</rp><rt>{part.reading}</rt><rp>）</rp></ruby> : part.text)}</>;
}
