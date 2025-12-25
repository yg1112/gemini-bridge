#!/usr/bin/env python3
"""测试 Aider 与 Gemini Bridge 的连接"""
import subprocess
import time
import sys

# 启动 Aider 进程
cmd = [
    "aider",
    "--model", "openai/gemini-web",
    "--openai-api-base", "http://localhost:3000/v1",
    "--no-git",
    "--no-show-model-warnings"
]

print("🚀 启动 Aider...")
print("=" * 60)

proc = subprocess.Popen(
    cmd,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

# 发送测试命令
test_input = "N\nN\n请解释一下 test_file.py 文件的作用\n/exit\n"

try:
    stdout, _ = proc.communicate(input=test_input, timeout=60)
    print(stdout)
except subprocess.TimeoutExpired:
    print("⏱️  测试超时（这是正常的，因为需要等待 Gemini 响应）")
    proc.kill()
    stdout, _ = proc.communicate()
    print(stdout[:2000])  # 打印前2000字符
except Exception as e:
    print(f"❌ 错误: {e}")

print("\n" + "=" * 60)
print("测试完成")

