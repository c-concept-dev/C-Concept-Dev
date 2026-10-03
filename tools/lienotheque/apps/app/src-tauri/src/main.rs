// Pas de console sur Windows en version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lienotheque_bureau::run()
}
