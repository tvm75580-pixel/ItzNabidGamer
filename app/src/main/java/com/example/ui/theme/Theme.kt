package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val ObsidianColorScheme =
  darkColorScheme(
    primary = MoltenOrange,
    secondary = MoltenGold,
    tertiary = CrimsonRed,
    background = ObsidianBackground,
    surface = ObsidianPanel,
    onPrimary = ObsidianBackground,
    onSecondary = ObsidianBackground,
    onTertiary = Color.White,
    onBackground = Color(0xFFF1F5F9),
    onSurface = Color(0xFFF1F5F9),
  )

@Composable
fun MyApplicationTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = ObsidianColorScheme, typography = Typography, content = content)
}
