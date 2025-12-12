import React from "react"
import cssText from "data-text:~/contents/style.css"
import { Card } from "~/components/ui/Card"
import { Button } from "~/components/ui/Button"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const Popup: React.FC = () => {
  return (
    <div className="w-80 p-6 bg-white">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Fiber
          </h1>
          <p className="text-sm text-gray-500">
            Tự động tóm tắt và kiểm tra thông tin bài viết
          </p>
        </div>

        <Card>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Tính năng
              </h3>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Tự động tóm tắt bài viết</li>
                <li>• Kiểm tra thông tin khi chọn text</li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Truy cập vnexpress.net, tuoitre.vn để sử dụng
          </p>
        </div>
      </div>
    </div>
  )
}

export default Popup

