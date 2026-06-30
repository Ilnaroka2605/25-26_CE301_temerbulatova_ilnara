from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
import os
import requests
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
FLASK_URL = "http://127.0.0.1:5000/chat"

# /start command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🤖 Hello! I'm your AI Assistant Bot.\n\n"
        "You can chat with me here or use the web app.\n\n"
        "Type anything to start chatting!"
    )
# /help command
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    help_text = (
        "🤖 *Aura AI Assistant*\n\n"
        "Here are the commands you can use:\n\n"
        "/start – Start the bot\n"
        "/help – Show this help menu\n"
        "/about – About this bot\n"
        "/clear – Clear the chat messages\n\n"
        "You can also just type any message and I will respond using AI."
    )

    await update.message.reply_text(help_text, parse_mode="Markdown")
# /about command
async def about(update: Update, context: ContextTypes.DEFAULT_TYPE):
    about_text = (
        "✨ *Aura AI Assistant*\n\n"
        "Aura is an AI assistant powered by Google's Gemini model.\n\n"
        "Features:\n"
        "• AI conversation\n"
        "• Weather information\n"
        "• News updates\n"
        "Created as part of an AI chatbot project."
    )

    await update.message.reply_text(about_text, parse_mode="Markdown")
# /clear command
async def clear_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    message_id = update.message.message_id

    # delete last 20 messages
    for i in range(1, 21):
        try:
            await context.bot.delete_message(chat_id=chat_id, message_id=message_id - i)
        except:
            pass

    await update.message.reply_text("🧹 Chat cleaned.")
    
# normal messages
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text

    try:
        response = requests.post(FLASK_URL, json={"message": user_text})
        data = response.json()

        bot_reply = data.get("reply", "⚠️ No response from AI.")
    except Exception as e:
        bot_reply = f"⚠️ Error connecting to server: {e}"

    await update.message.reply_text(bot_reply)
    
def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("about", about))
    app.add_handler(CommandHandler("clear", clear_chat))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("🤖 Telegram bot running...")
    app.run_polling()

if __name__ == "__main__":
    main()
