#!/bin/bash
# 发布 skills 到 ClawHub

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUMP="${1:-patch}"  # 默认 patch，可传 minor 或 major

echo "📦 准备发布 skills..."
echo "版本升级类型: $BUMP"
echo ""

# 检查登录状态
if ! clawhub whoami &>/dev/null; then
    echo "❌ 未登录，请先运行: clawhub login"
    exit 1
fi

# 使用 workdir 确保从项目目录发布
clawhub --workdir "$SCRIPT_DIR" --dir skills sync --bump "$BUMP" --changelog "Update from moltoffer-skills repo"

echo ""
echo "🎉 发布完成！"
