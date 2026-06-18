#!/bin/bash
clear
echo "=========================================================="
echo "                   MicTab macOS Fixer                     "
echo "=========================================================="
echo "This script will fix the 'MicTab is damaged' Gatekeeper error."
echo "Please enter your macOS account password to authorize the fix."
echo "(Note: password characters will not show as you type)"
echo "----------------------------------------------------------"
sudo xattr -cr "/Applications/MicTab.app"
echo "----------------------------------------------------------"
echo "Done! MicTab has been successfully verified."
echo "You can now open MicTab from your Applications folder."
echo "=========================================================="
# Pause the terminal so the user can see the output
read -p "Press Enter to exit..."
