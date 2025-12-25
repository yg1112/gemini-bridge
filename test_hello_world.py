#!/usr/bin/env python3
"""测试 Aider 创建 Hello World 脚本"""
import subprocess
import os
import time

# 创建测试目录
test_dir = "/tmp/aider_test"
os.makedirs(test_dir, exist_ok=True)
os.chdir(test_dir)

print("=" * 60)
print("🧪 测试：Aider + Gemini Bridge")
print("=" * 60)
print(f"📁 测试目录: {test_dir}")
print()

# 启动 Aider 进程
cmd = [
    "aider",
    "--model", "openai/gemini-web",
    "--openai-api-base", "http://localhost:3000/v1",
    "--no-git",
    "--no-show-model-warnings",
    "--yes"  # 自动应用更改
]

print("🚀 启动 Aider...")
print()

proc = subprocess.Popen(
    cmd,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
    cwd=test_dir
)

# 发送测试命令
test_input = "N\nN\n请帮我写一个 python 脚本，打印 hello world\n/exit\n"

print("📤 发送请求: 请帮我写一个 python 脚本，打印 hello world")
print("⏳ 等待响应...")
print()

try:
    stdout, _ = proc.communicate(input=test_input, timeout=180)
    print("=" * 60)
    print("📥 Aider 输出:")
    print("=" * 60)
    print(stdout)
    print("=" * 60)
    
    # 检查是否创建了文件
    files = os.listdir(test_dir)
    py_files = [f for f in files if f.endswith('.py')]
    
    if py_files:
        print(f"\n✅ 成功创建文件: {py_files}")
        for py_file in py_files:
            file_path = os.path.join(test_dir, py_file)
            print(f"\n📄 {py_file} 内容:")
            print("-" * 40)
            with open(file_path, 'r') as f:
                print(f.read())
            print("-" * 40)
    else:
        print("\n⚠️  未找到创建的 Python 文件")
        
except subprocess.TimeoutExpired:
    print("⏱️  测试超时（可能需要更长时间等待 Gemini 响应）")
    proc.kill()
    stdout, _ = proc.communicate()
    print("\n📥 部分输出:")
    print(stdout[-2000:])  # 打印最后2000字符
except Exception as e:
    print(f"❌ 错误: {e}")

print("\n" + "=" * 60)
print("测试完成")
print("=" * 60)

